// Local preferences for this device (not synced to the server).
import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';

import 'identity.dart';

class LumioSettings extends ChangeNotifier {
  LumioSettings._(this._store, this._fileEffectId, this._savePhotos);

  /// Defaults, kept only in memory (tests and previews).
  factory LumioSettings.memory({String fileEffectId = defaultFileEffectId, bool savePhotos = true}) =>
      LumioSettings._(null, fileEffectId, savePhotos);

  static const defaultFileEffectId = 'cosmic-portal';
  static const _key = 'lumio.settings';

  final SecureStore? _store;
  String _fileEffectId;
  bool _savePhotos;

  /// The effect that plays on the other device when this device sends files.
  String get fileEffectId => _fileEffectId;

  /// Whether received photos and videos are also added to the Photos library.
  bool get savePhotos => _savePhotos;

  /// Loads saved settings, falling back to defaults for anything missing or unreadable.
  static Future<LumioSettings> load(SecureStore store) async {
    var effect = defaultFileEffectId;
    var photos = true;
    try {
      final raw = await store.read(_key);
      final json = raw == null ? null : jsonDecode(raw);
      if (json is Map<String, dynamic>) {
        if (json['fileEffectId'] is String) effect = json['fileEffectId'] as String;
        if (json['savePhotos'] is bool) photos = json['savePhotos'] as bool;
      }
    } catch (_) {
      // Corrupt settings: start from defaults.
    }
    return LumioSettings._(store, effect, photos);
  }

  set fileEffectId(String id) {
    if (id == _fileEffectId) return;
    _fileEffectId = id;
    _changed();
  }

  set savePhotos(bool value) {
    if (value == _savePhotos) return;
    _savePhotos = value;
    _changed();
  }

  void _changed() {
    notifyListeners();
    unawaited(_store?.write(_key, jsonEncode({'fileEffectId': _fileEffectId, 'savePhotos': _savePhotos})));
  }
}
