import 'dart:convert';

import 'package:flutter/services.dart';

/// One entry of the trusted effect catalog (protocol/effects/catalog.json, synced into assets/).
class EffectDefinition {
  const EffectDefinition({
    required this.id,
    required this.name,
    required this.description,
    required this.category,
    required this.defaultDuration,
    required this.minDuration,
    required this.maxDuration,
    required this.defaultIntensity,
    required this.hasSound,
    required this.accent,
  });

  factory EffectDefinition.fromJson(Map<String, dynamic> j) => EffectDefinition(
    id: j['id'] as String,
    name: j['name'] as String,
    description: j['description'] as String,
    category: j['category'] as String,
    defaultDuration: j['defaultDuration'] as int,
    minDuration: j['minDuration'] as int,
    maxDuration: j['maxDuration'] as int,
    defaultIntensity: (j['defaultIntensity'] as num).toDouble(),
    hasSound: j['hasSound'] as bool,
    accent: (j['accent'] as List).cast<String>().map(_hex).toList(growable: false),
  );

  final String id;
  final String name;
  final String description;
  final String category;
  final int defaultDuration;
  final int minDuration;
  final int maxDuration;
  final double defaultIntensity;
  final bool hasSound;
  final List<Color> accent;

  String get categoryLabel => category[0].toUpperCase() + category.substring(1);
  String get durationLabel => '${(defaultDuration / 1000).toStringAsFixed(defaultDuration % 1000 == 0 ? 0 : 1)}s';
}

Color _hex(String s) => Color(0xFF000000 | int.parse(s.substring(1), radix: 16));

class EffectCatalog {
  const EffectCatalog(this.version, this.effects);

  factory EffectCatalog.fromJson(String source) {
    final j = jsonDecode(source) as Map<String, dynamic>;
    final effects = (j['effects'] as List)
        .cast<Map<String, dynamic>>()
        .map(EffectDefinition.fromJson)
        .toList(growable: false);
    return EffectCatalog(j['version'] as int, effects);
  }

  static Future<EffectCatalog> load([AssetBundle? bundle]) async =>
      EffectCatalog.fromJson(await (bundle ?? rootBundle).loadString('assets/protocol/catalog.json'));

  final int version;
  final List<EffectDefinition> effects;

  /// Receivers only render ids that are in this catalog.
  bool contains(String id) => byId(id) != null;

  EffectDefinition? byId(String id) {
    for (final e in effects) {
      if (e.id == id) return e;
    }
    return null;
  }
}
