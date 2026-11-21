// HTTP client for the Synq server: challenge/response login and the REST API.
import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'identity.dart';

class DeviceSummary {
  const DeviceSummary({required this.deviceId, required this.name, required this.platform});
  factory DeviceSummary.fromJson(Map<String, dynamic> j) =>
      DeviceSummary(deviceId: j['deviceId'] as String, name: j['name'] as String, platform: j['platform'] as String);

  final String deviceId;
  final String name;
  final String platform;
}

class PeerRecord {
  PeerRecord({
    required this.deviceId,
    required this.name,
    required this.platform,
    required this.publicKey,
    required this.online,
    required this.lastSeenAt,
    required this.pairedAt,
  });

  factory PeerRecord.fromJson(Map<String, dynamic> j) => PeerRecord(
    deviceId: j['deviceId'] as String,
    name: j['name'] as String,
    platform: j['platform'] as String,
    publicKey: j['publicKey'] as String,
    online: j['online'] as bool,
    lastSeenAt: j['lastSeenAt'] as int?,
    pairedAt: j['pairedAt'] as int,
  );

  final String deviceId;
  String name;
  final String platform;
  final String publicKey;
  bool online;
  int? lastSeenAt;
  final int pairedAt;
}

class PairingCreated {
  PairingCreated(this.pairingId, this.code, this.expiresAt);
  final String pairingId;
  final String code;
  final int expiresAt;
}

class PairingClaimed {
  PairingClaimed(this.pairingId, this.sas, this.initiator);
  final String pairingId;
  final String sas;
  final DeviceSummary initiator;
}

class RecentEffect {
  RecentEffect.fromJson(Map<String, dynamic> j)
    : eventId = j['eventId'] as String,
      direction = j['direction'] as String,
      peerName = j['peerName'] as String,
      effectId = j['effectId'] as String,
      status = j['status'] as String,
      at = j['at'] as int;

  final String eventId;
  final String direction;
  final String peerName;
  final String effectId;
  final String status;
  final int at;
}

class ApiException implements Exception {
  const ApiException(this.status, this.code, this.message);
  final int status;
  final String code;
  final String message;

  bool get isRevoked => status == 403 && code == 'forbidden';

  @override
  String toString() => message;
}

class Session {
  Session(this.token, this.expiresAt, this.device);
  final String token;
  final int expiresAt;
  final DeviceSummary device;
}

class DeviceInfo {
  const DeviceInfo({required this.name, required this.platform, required this.appVersion});
  final String name;
  final String platform;
  final String appVersion;
  Map<String, String> toJson() => {'name': name, 'platform': platform, 'appVersion': appVersion};
}

class ApiClient {
  ApiClient({required String baseUrl, required this.identity, required this.device})
    : baseUrl = baseUrl.replaceAll(RegExp(r'/+$'), '');

  final String baseUrl;
  final Identity identity;
  final DeviceInfo device;
  final HttpClient _http = HttpClient()..connectionTimeout = const Duration(seconds: 5);
  Session? _session;
  Future<Session>? _loggingIn;

  static const _timeout = Duration(seconds: 10);

  Future<Object?> _send(String method, String path, {Object? body, String? token}) async {
    try {
      final req = await _http.openUrl(method, Uri.parse('$baseUrl$path')).timeout(_timeout);
      if (token != null) req.headers.set(HttpHeaders.authorizationHeader, 'Bearer $token');
      if (body != null) {
        req.headers.contentType = ContentType.json;
        req.write(jsonEncode(body));
      }
      final res = await req.close().timeout(_timeout);
      final text = await res.transform(utf8.decoder).join().timeout(_timeout);
      final json = text.isEmpty ? null : jsonDecode(text);
      if (res.statusCode >= 200 && res.statusCode < 300) return json;
      final err = json is Map<String, dynamic> ? json['error'] as Map<String, dynamic>? : null;
      throw ApiException(
        res.statusCode,
        err?['code'] as String? ?? 'error',
        err?['message'] as String? ?? 'The server returned an error.',
      );
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw const ApiException(0, 'network', 'The Synq server did not respond in time.');
    } on SocketException {
      throw const ApiException(0, 'network', "Can't reach the Synq server.");
    } on HttpException {
      throw const ApiException(0, 'network', "Can't reach the Synq server.");
    } on FormatException {
      throw const ApiException(0, 'bad_response', 'Unexpected response from the server.');
    }
  }

  Future<Session> _login() async {
    final pk = identity.publicKey;
    final challenge = await _send('POST', '/v1/auth/challenge', body: {'publicKey': pk}) as Map<String, dynamic>;
    final nonce = challenge['nonce'] as String;
    final signature = await identity.sign(utf8.encode('synq-auth-v1|$nonce|$pk'));
    final res = await _send(
      'POST',
      '/v1/auth/token',
      body: {'publicKey': pk, 'nonce': nonce, 'signature': signature, 'device': device.toJson()},
    ) as Map<String, dynamic>;
    return Session(
      res['token'] as String,
      res['expiresAt'] as int,
      DeviceSummary.fromJson(res['device'] as Map<String, dynamic>),
    );
  }

  /// A valid session, logging in again shortly before expiry. Concurrent callers share one login.
  Future<Session> session() async {
    final s = _session;
    if (s != null && s.expiresAt > DateTime.now().millisecondsSinceEpoch + 60000) return s;
    final pending = _loggingIn ??= _login();
    try {
      return _session = await pending;
    } finally {
      _loggingIn = null;
    }
  }

  Future<Object?> _authed(String method, String path, {Object? body}) async {
    for (var attempt = 0; attempt < 2; attempt++) {
      final s = await session();
      try {
        return await _send(method, path, body: body, token: s.token);
      } on ApiException catch (e) {
        if (e.status == 401 && attempt == 0) {
          _session = null;
          continue;
        }
        rethrow;
      }
    }
    throw const ApiException(401, 'unauthorized', 'Could not sign in.');
  }

  Future<List<PeerRecord>> devices() async {
    final res = await _authed('GET', '/v1/devices') as Map<String, dynamic>;
    return (res['devices'] as List).cast<Map<String, dynamic>>().map(PeerRecord.fromJson).toList();
  }

  Future<DeviceSummary> rename(String name) async =>
      DeviceSummary.fromJson(await _authed('PATCH', '/v1/me', body: {'name': name}) as Map<String, dynamic>);

  Future<void> unpair(String deviceId) => _authed('DELETE', '/v1/devices/$deviceId');

  Future<PairingCreated> createPairing() async {
    final res = await _authed('POST', '/v1/pairing') as Map<String, dynamic>;
    return PairingCreated(res['pairingId'] as String, res['code'] as String, res['expiresAt'] as int);
  }

  Future<PairingClaimed> claimPairing(String code) async {
    final res = await _authed('POST', '/v1/pairing/claim', body: {'code': code}) as Map<String, dynamic>;
    return PairingClaimed(
      res['pairingId'] as String,
      res['sas'] as String,
      DeviceSummary.fromJson(res['initiator'] as Map<String, dynamic>),
    );
  }

  Future<void> approvePairing(String id) => _authed('POST', '/v1/pairing/$id/approve');
  Future<void> rejectPairing(String id) => _authed('POST', '/v1/pairing/$id/reject');

  Future<List<RecentEffect>> recentEffects() async {
    final res = await _authed('GET', '/v1/effects/recent') as Map<String, dynamic>;
    return (res['effects'] as List).cast<Map<String, dynamic>>().map(RecentEffect.fromJson).toList();
  }

  void close() => _http.close(force: true);
}
