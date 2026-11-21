import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Material 3 dark theme built from the shared Synq design tokens.
ThemeData buildSynqTheme() {
  const scheme = ColorScheme.dark(
    surface: SynqColors.bg,
    surfaceContainer: SynqColors.surface,
    surfaceContainerHigh: SynqColors.surfaceRaised,
    primary: SynqColors.accent,
    onPrimary: Colors.white,
    secondary: SynqColors.accentAlt,
    // Tonal surfaces (navigation indicator, tonal buttons, chips) use a tint of the accent.
    secondaryContainer: Color(0xFF2A2352),
    onSecondaryContainer: SynqColors.text,
    error: SynqColors.danger,
    onSurface: SynqColors.text,
    onSurfaceVariant: SynqColors.textMuted,
    outline: SynqColors.border,
    outlineVariant: SynqColors.borderStrong,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: SynqColors.bg);
  return base.copyWith(
    textTheme: base.textTheme
        .apply(bodyColor: SynqColors.text, displayColor: SynqColors.text)
        .copyWith(
          headlineMedium: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600, letterSpacing: -0.5),
          titleMedium: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          bodyMedium: const TextStyle(fontSize: 14, color: SynqColors.text),
          bodySmall: const TextStyle(fontSize: 12, color: SynqColors.textMuted),
          labelSmall: const TextStyle(fontSize: 11, letterSpacing: 0.6, color: SynqColors.textFaint),
        ),
    cardTheme: const CardThemeData(
      color: SynqColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(SynqRadius.lg)),
        side: BorderSide(color: SynqColors.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(SynqRadius.md))),
        padding: const EdgeInsets.symmetric(horizontal: SynqSpace.lg, vertical: SynqSpace.md),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: SynqColors.surfaceRaised,
      contentTextStyle: TextStyle(color: SynqColors.text, fontSize: 14),
      behavior: SnackBarBehavior.floating,
    ),
    splashFactory: InkSparkle.splashFactory,
  );
}
