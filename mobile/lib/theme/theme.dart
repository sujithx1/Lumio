import 'package:flutter/material.dart';

import 'tokens.g.dart';

/// Material 3 dark theme built from the shared Lumio design tokens.
ThemeData buildLumioTheme() {
  const scheme = ColorScheme.dark(
    surface: LumioColors.bg,
    surfaceContainer: LumioColors.surface,
    surfaceContainerHigh: LumioColors.surfaceRaised,
    primary: LumioColors.accent,
    onPrimary: Colors.white,
    secondary: LumioColors.accentAlt,
    // Tonal surfaces (navigation indicator, tonal buttons, chips) use a tint of the accent.
    secondaryContainer: Color(0xFF2A2352),
    onSecondaryContainer: LumioColors.text,
    error: LumioColors.danger,
    onSurface: LumioColors.text,
    onSurfaceVariant: LumioColors.textMuted,
    outline: LumioColors.border,
    outlineVariant: LumioColors.borderStrong,
  );

  final base = ThemeData(useMaterial3: true, colorScheme: scheme, scaffoldBackgroundColor: LumioColors.bg);
  return base.copyWith(
    textTheme: base.textTheme
        .apply(bodyColor: LumioColors.text, displayColor: LumioColors.text)
        .copyWith(
          headlineMedium: const TextStyle(fontSize: 28, fontWeight: FontWeight.w600, letterSpacing: -0.5),
          titleMedium: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
          bodyMedium: const TextStyle(fontSize: 14, color: LumioColors.text),
          bodySmall: const TextStyle(fontSize: 12, color: LumioColors.textMuted),
          labelSmall: const TextStyle(fontSize: 11, letterSpacing: 0.6, color: LumioColors.textFaint),
        ),
    cardTheme: const CardThemeData(
      color: LumioColors.surface,
      elevation: 0,
      margin: EdgeInsets.zero,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.all(Radius.circular(LumioRadius.lg)),
        side: BorderSide(color: LumioColors.border),
      ),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        foregroundColor: Colors.white,
        shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(LumioRadius.md))),
        padding: const EdgeInsets.symmetric(horizontal: LumioSpace.lg, vertical: LumioSpace.md),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      backgroundColor: LumioColors.surfaceRaised,
      contentTextStyle: TextStyle(color: LumioColors.text, fontSize: 14),
      behavior: SnackBarBehavior.floating,
    ),
    splashFactory: InkSparkle.splashFactory,
  );
}
