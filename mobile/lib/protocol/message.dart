// Dart model of protocol/schemas/message.schema.json.
//
// Hand-maintained; kept in lock-step with the TypeScript (server) and Rust (desktop) implementations
// by the shared fixtures in protocol/fixtures (see test/protocol_fixtures_test.dart).
// Every message arriving from the network is untrusted: parseMessage / parseValue are the only way in.
import 'dart:convert';

const int protocolVersion = 1;
const int maxMessageLifetimeMs = 60000;
const int maxFrameBytes = 16 * 1024;
const int _maxSafeInteger = 9007199254740991;

enum ParseErrorCode {
  frameTooLarge,
  malformedJson,
  invalidEnvelope,
  unknownType,
  invalidMessage,
  invalidLifetime,
  selfAddressed,
}

class ProtocolException implements Exception {
  const ProtocolException(this.code, this.detail);
  final ParseErrorCode code;
  final String detail;

  @override
  String toString() => 'ProtocolException(${code.name}): $detail';
}

enum DevicePlatform { macos, windows, linux, android, ios }

enum EffectFailureReason {
  unknownEffect('unknown_effect'),
  expired('expired'),
  duplicate('duplicate'),
  invalidSignature('invalid_signature'),
  notPaired('not_paired'),
  unsupported('unsupported'),
  busy('busy'),
  renderError('render_error');

  const EffectFailureReason(this.wire);
  final String wire;
}

enum EffectRelayStatus {
  relayed('relayed'),
  receiverOffline('receiver_offline'),
  notified('notified'),
  expired('expired'),
  rejected('rejected');

  const EffectRelayStatus(this.wire);
  final String wire;
}

enum FileFailureReason {
  checksumMismatch('checksum_mismatch'),
  downloadFailed('download_failed'),
  storageError('storage_error'),
  tooLarge('too_large'),
  invalidSignature('invalid_signature'),
  notPaired('not_paired'),
  expired('expired'),
  unsupported('unsupported');

  const FileFailureReason(this.wire);
  final String wire;
}

/// Largest file size the protocol can describe (4 GiB). The relay usually enforces a lower limit.
const int maxProtocolFileSize = 4294967296;

enum ErrorCode {
  badRequest('bad_request'),
  unauthorized('unauthorized'),
  forbidden('forbidden'),
  notFound('not_found'),
  rateLimited('rate_limited'),
  internal('internal');

  const ErrorCode(this.wire);
  final String wire;
}

class DeviceSummary {
  const DeviceSummary({required this.deviceId, required this.name, required this.platform});
  final String deviceId;
  final String name;
  final DevicePlatform platform;
}

sealed class Body {
  const Body();
}

final class AuthBody extends Body {
  const AuthBody(this.token);
  final String token;
}

final class AuthOkBody extends Body {
  const AuthOkBody(this.deviceId, this.serverTime);
  final String deviceId;
  final int serverTime;
}

final class HeartbeatBody extends Body {
  const HeartbeatBody();
}

final class DevicePairRequestBody extends Body {
  const DevicePairRequestBody(this.pairingId, this.claimant, this.sas);
  final String pairingId;
  final DeviceSummary claimant;
  final String sas;
}

final class DevicePairApprovedBody extends Body {
  const DevicePairApprovedBody(this.pairingId, this.peer, this.peerPublicKey);
  final String pairingId;
  final DeviceSummary peer;
  final String peerPublicKey;
}

final class DevicePairRejectedBody extends Body {
  const DevicePairRejectedBody(this.pairingId);
  final String pairingId;
}

final class DevicePairRevokedBody extends Body {
  const DevicePairRevokedBody(this.peerDeviceId);
  final String peerDeviceId;
}

final class DeviceOnlineBody extends Body {
  const DeviceOnlineBody(this.deviceId);
  final String deviceId;
}

final class DeviceOfflineBody extends Body {
  const DeviceOfflineBody(this.deviceId, this.lastSeenAt);
  final String deviceId;
  final int lastSeenAt;
}

final class EffectTriggerBody extends Body {
  const EffectTriggerBody({
    required this.effectId,
    required this.duration,
    required this.intensity,
    required this.sound,
  });
  final String effectId;
  final int duration;
  final double intensity;
  final bool sound;
}

final class EffectReceivedBody extends Body {
  const EffectReceivedBody(this.eventId);
  final String eventId;
}

final class EffectCompletedBody extends Body {
  const EffectCompletedBody(this.eventId);
  final String eventId;
}

final class EffectFailedBody extends Body {
  const EffectFailedBody(this.eventId, this.reason);
  final String eventId;
  final EffectFailureReason reason;
}

final class EffectStatusBody extends Body {
  const EffectStatusBody(this.eventId, this.status);
  final String eventId;
  final EffectRelayStatus status;
}

final class FileOfferBody extends Body {
  const FileOfferBody({
    required this.transferId,
    required this.name,
    required this.size,
    required this.mime,
    required this.sha256,
    required this.effectId,
  });
  final String transferId;
  final String name;
  final int size;
  final String mime;
  final String sha256;
  final String effectId;
}

final class FileReceivedBody extends Body {
  const FileReceivedBody(this.transferId);
  final String transferId;
}

final class FileFailedBody extends Body {
  const FileFailedBody(this.transferId, this.reason);
  final String transferId;
  final FileFailureReason reason;
}

final class ErrorBody extends Body {
  const ErrorBody(this.code, this.message, this.refId);
  final ErrorCode code;
  final String message;
  final String? refId;
}

/// A validated protocol message.
class LumioMessage {
  const LumioMessage({
    required this.id,
    required this.from,
    required this.to,
    required this.createdAt,
    required this.expiresAt,
    required this.sig,
    required this.body,
  });

  final String id;
  final String from;
  final String to;
  final int createdAt;
  final int expiresAt;
  final String? sig;
  final Body body;
}

/// Parses and validates an untrusted raw frame.
LumioMessage parseMessage(String frame) {
  if (utf8.encode(frame).length > maxFrameBytes) {
    throw const ProtocolException(ParseErrorCode.frameTooLarge, 'frame exceeds $maxFrameBytes bytes');
  }
  final Object? value;
  try {
    value = jsonDecode(frame);
  } on FormatException catch (e) {
    throw ProtocolException(ParseErrorCode.malformedJson, e.message);
  }
  return parseValue(value);
}

const _envelopeRequired = {'v', 'id', 'type', 'from', 'to', 'createdAt', 'expiresAt', 'payload'};

/// Validates an already-decoded JSON value. Same rules as [parseMessage] minus the size check.
LumioMessage parseValue(Object? value) {
  const env = ParseErrorCode.invalidEnvelope;
  if (_containsNull(value)) throw const ProtocolException(env, 'null is not a valid value anywhere in a message');
  final e = _Obj(value, 'message', env)..keys(_envelopeRequired, optional: {'sig'});

  if (e.integer('v') != protocolVersion) throw const ProtocolException(env, 'unsupported protocol version');
  final id = e.string('id', test: isUuid);
  final type = e.string('type', max: 32);
  final from = e.string('from', test: _isAddress);
  final to = e.string('to', test: _isAddress);
  final createdAt = e.integer('createdAt', min: 0, max: _maxSafeInteger);
  final expiresAt = e.integer('expiresAt', min: 0, max: _maxSafeInteger);
  final payload = e.object('payload');
  final sig = e.has('sig') ? e.string('sig', test: (s) => _isBase64Url(s, 86)) : null;

  final body = _parseBody(type, from, to, sig, payload.inner(ParseErrorCode.invalidMessage));

  final lifetime = expiresAt - createdAt;
  if (lifetime <= 0 || lifetime > maxMessageLifetimeMs) {
    throw ProtocolException(
      ParseErrorCode.invalidLifetime,
      'lifetime must be in (0, $maxMessageLifetimeMs] ms, got $lifetime',
    );
  }
  if (from == to) throw const ProtocolException(ParseErrorCode.selfAddressed, 'from and to must differ');

  return LumioMessage(id: id, from: from, to: to, createdAt: createdAt, expiresAt: expiresAt, sig: sig, body: body);
}

Body _parseBody(String type, String from, String to, String? sig, _Obj p) {
  final fromServer = from == 'server';
  final toServer = to == 'server';

  void serverOnly() {
    if (!fromServer) _invalid('only the server may send $type');
  }

  void signed() {
    if (fromServer || toServer) _invalid('device-to-device messages cannot involve the server');
    if (sig == null) _invalid('device-to-device messages must be signed');
  }

  switch (type) {
    case 'AUTH':
      if (!toServer) _invalid('AUTH must be addressed to the server');
      p.keys({'token'});
      return AuthBody(p.string('token', min: 16, max: 4096));
    case 'AUTH_OK':
      serverOnly();
      p.keys({'deviceId', 'serverTime'});
      return AuthOkBody(p.string('deviceId', test: isUuid), p.integer('serverTime', min: 0, max: _maxSafeInteger));
    case 'HEARTBEAT':
      p.keys(const {});
      return const HeartbeatBody();
    case 'DEVICE_PAIR_REQUEST':
      serverOnly();
      p.keys({'pairingId', 'claimant', 'sas'});
      return DevicePairRequestBody(
        p.string('pairingId', test: isUuid),
        _summary(p.object('claimant')),
        p.string('sas', test: (s) => RegExp(r'^[0-9]{6}$').hasMatch(s)),
      );
    case 'DEVICE_PAIR_APPROVED':
      serverOnly();
      p.keys({'pairingId', 'peer', 'peerPublicKey'});
      return DevicePairApprovedBody(
        p.string('pairingId', test: isUuid),
        _summary(p.object('peer')),
        p.string('peerPublicKey', test: (s) => _isBase64Url(s, 43)),
      );
    case 'DEVICE_PAIR_REJECTED':
      serverOnly();
      p.keys({'pairingId'});
      return DevicePairRejectedBody(p.string('pairingId', test: isUuid));
    case 'DEVICE_PAIR_REVOKED':
      serverOnly();
      p.keys({'peerDeviceId'});
      return DevicePairRevokedBody(p.string('peerDeviceId', test: isUuid));
    case 'DEVICE_ONLINE':
      serverOnly();
      p.keys({'deviceId'});
      return DeviceOnlineBody(p.string('deviceId', test: isUuid));
    case 'DEVICE_OFFLINE':
      serverOnly();
      p.keys({'deviceId', 'lastSeenAt'});
      return DeviceOfflineBody(
        p.string('deviceId', test: isUuid),
        p.integer('lastSeenAt', min: 0, max: _maxSafeInteger),
      );
    case 'EFFECT_TRIGGER':
      signed();
      p.keys({'effectId', 'duration', 'intensity', 'sound'});
      return EffectTriggerBody(
        effectId: p.string('effectId', test: isEffectId),
        duration: p.integer('duration', min: 1000, max: 15000),
        intensity: p.number('intensity', min: 0, max: 1),
        sound: p.boolean('sound'),
      );
    case 'EFFECT_RECEIVED':
      signed();
      p.keys({'eventId'});
      return EffectReceivedBody(p.string('eventId', test: isUuid));
    case 'EFFECT_COMPLETED':
      signed();
      p.keys({'eventId'});
      return EffectCompletedBody(p.string('eventId', test: isUuid));
    case 'EFFECT_FAILED':
      signed();
      p.keys({'eventId', 'reason'});
      return EffectFailedBody(
        p.string('eventId', test: isUuid),
        p.wireEnum('reason', EffectFailureReason.values, (r) => r.wire),
      );
    case 'EFFECT_STATUS':
      serverOnly();
      p.keys({'eventId', 'status'});
      return EffectStatusBody(
        p.string('eventId', test: isUuid),
        p.wireEnum('status', EffectRelayStatus.values, (s) => s.wire),
      );
    case 'FILE_OFFER':
      signed();
      p.keys({'transferId', 'name', 'size', 'mime', 'sha256', 'effectId'});
      return FileOfferBody(
        transferId: p.string('transferId', test: isUuid),
        name: p.string('name', min: 1, max: 255, test: isFileName),
        size: p.integer('size', min: 0, max: maxProtocolFileSize),
        mime: p.string('mime', max: 127, test: isMimeType),
        sha256: p.string('sha256', test: isSha256),
        effectId: p.string('effectId', test: isEffectId),
      );
    case 'FILE_RECEIVED':
      signed();
      p.keys({'transferId'});
      return FileReceivedBody(p.string('transferId', test: isUuid));
    case 'FILE_FAILED':
      signed();
      p.keys({'transferId', 'reason'});
      return FileFailedBody(
        p.string('transferId', test: isUuid),
        p.wireEnum('reason', FileFailureReason.values, (r) => r.wire),
      );
    case 'ERROR':
      serverOnly();
      p.keys({'code', 'message'}, optional: {'refId'});
      return ErrorBody(
        p.wireEnum('code', ErrorCode.values, (c) => c.wire),
        p.string('message', max: 256),
        p.has('refId') ? p.string('refId', test: isUuid) : null,
      );
    default:
      throw ProtocolException(ParseErrorCode.unknownType, 'unknown message type "$type"');
  }
}

DeviceSummary _summary(_Obj o) {
  o.keys({'deviceId', 'name', 'platform'});
  return DeviceSummary(
    deviceId: o.string('deviceId', test: isUuid),
    name: o.string('name', min: 1, max: 64),
    platform: o.wireEnum('platform', DevicePlatform.values, (p) => p.name),
  );
}

Never _invalid(String detail) => throw ProtocolException(ParseErrorCode.invalidMessage, detail);

bool _containsNull(Object? v) => switch (v) {
  null => true,
  final List<dynamic> l => l.any(_containsNull),
  final Map<String, dynamic> m => m.values.any(_containsNull),
  _ => false,
};

final _uuid = RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
final _effectId = RegExp(r'^[a-z0-9]+(-[a-z0-9]+)*$');
final _base64Url = RegExp(r'^[A-Za-z0-9_-]+$');
final _fileName = RegExp(r'^[^\u0000-\u001f\u007f/\\]+$');
final _mime = RegExp(r'^[A-Za-z0-9][A-Za-z0-9.+_-]*/[A-Za-z0-9][A-Za-z0-9.+_-]*$');
final _sha256 = RegExp(r'^[0-9a-f]{64}$');

bool isUuid(String s) => _uuid.hasMatch(s);
bool isEffectId(String s) => s.length <= 48 && _effectId.hasMatch(s);
/// Same rule as protocol FileName: no control characters or path separators.
bool isFileName(String s) => s.isNotEmpty && s.runes.length <= 255 && _fileName.hasMatch(s);
bool isMimeType(String s) => s.length <= 127 && _mime.hasMatch(s);
bool isSha256(String s) => _sha256.hasMatch(s);
bool _isAddress(String s) => s == 'server' || isUuid(s);
bool _isBase64Url(String s, int length) => s.length == length && _base64Url.hasMatch(s);

/// Strict reader over a decoded JSON object: rejects unknown keys and wrong types.
class _Obj {
  _Obj(Object? value, this.where, this.code) : map = value is Map<String, dynamic> ? value : const {} {
    if (value is! Map<String, dynamic>) throw ProtocolException(code, '$where must be an object');
  }

  final Map<String, dynamic> map;
  final String where;
  final ParseErrorCode code;

  _Obj inner(ParseErrorCode newCode) => _Obj(map, where, newCode);

  Never _fail(String detail) => throw ProtocolException(code, '$where: $detail');

  void keys(Set<String> required, {Set<String> optional = const {}}) {
    for (final k in required) {
      if (!map.containsKey(k)) _fail('missing "$k"');
    }
    for (final k in map.keys) {
      if (!required.contains(k) && !optional.contains(k)) _fail('unexpected "$k"');
    }
  }

  bool has(String key) => map.containsKey(key);

  String string(String key, {int min = 0, int? max, bool Function(String)? test}) {
    final v = map[key];
    if (v is! String) _fail('"$key" must be a string');
    final length = v.runes.length;
    if (length < min || (max != null && length > max)) _fail('"$key" has invalid length');
    if (test != null && !test(v)) _fail('"$key" is invalid');
    return v;
  }

  int integer(String key, {int? min, int? max}) {
    final v = map[key];
    if (v is! int) _fail('"$key" must be an integer');
    if ((min != null && v < min) || (max != null && v > max)) _fail('"$key" is out of range');
    return v;
  }

  double number(String key, {required double min, required double max}) {
    final v = map[key];
    if (v is! num) _fail('"$key" must be a number');
    if (v < min || v > max) _fail('"$key" is out of range');
    return v.toDouble();
  }

  bool boolean(String key) {
    final v = map[key];
    if (v is! bool) _fail('"$key" must be a boolean');
    return v;
  }

  _Obj object(String key) => _Obj(map[key], '$where.$key', code);

  T wireEnum<T>(String key, List<T> values, String Function(T) wire) {
    final v = string(key);
    for (final candidate in values) {
      if (wire(candidate) == v) return candidate;
    }
    _fail('"$key" has unknown value "$v"');
  }
}
