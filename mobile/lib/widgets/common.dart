import 'package:flutter/material.dart';

import '../core/engine.dart';
import '../effects/catalog.dart';
import '../theme/tokens.g.dart';

const platformLabels = {'macos': 'macOS', 'windows': 'Windows', 'linux': 'Linux', 'android': 'Android', 'ios': 'iOS'};

IconData platformIcon(String platform) =>
    platform == 'ios' || platform == 'android' ? Icons.smartphone_rounded : Icons.laptop_mac_rounded;

String timeAgo(int ms) {
  final s = (DateTime.now().millisecondsSinceEpoch - ms) ~/ 1000;
  if (s < 45) return 'just now';
  if (s < 3600) return '${(s / 60).round()} min ago';
  if (s < 86400) return '${(s / 3600).round()} h ago';
  return '${(s / 86400).round()} d ago';
}

(Color, String) connectionLook(SynqConnection c) => switch (c) {
  SynqConnection.online => (SynqColors.online, 'Connected'),
  SynqConnection.offline => (SynqColors.offline, 'Offline · retrying'),
  SynqConnection.revoked => (SynqColors.danger, 'Device removed'),
  SynqConnection.connecting => (SynqColors.textFaint, 'Connecting…'),
};

class StatusDot extends StatelessWidget {
  const StatusDot({super.key, required this.color, this.size = 8});
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
    width: size,
    height: size,
    decoration: BoxDecoration(
      color: color,
      shape: BoxShape.circle,
      boxShadow: [BoxShadow(color: color.withValues(alpha: 0.6), blurRadius: 6)],
    ),
  );
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.label, {super.key, this.trailing});
  final String label;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: SynqSpace.md),
    child: Row(
      children: [
        Expanded(child: Text(label.toUpperCase(), style: Theme.of(context).textTheme.labelSmall)),
        ?trailing,
      ],
    ),
  );
}

class EmptyCard extends StatelessWidget {
  const EmptyCard({super.key, required this.icon, required this.title, required this.body, this.action});
  final IconData icon;
  final String title;
  final String body;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: SynqSpace.xl, vertical: SynqSpace.xxl),
        child: Column(
          children: [
            Icon(icon, color: SynqColors.textMuted),
            const SizedBox(height: SynqSpace.md),
            Text(title, style: text.titleMedium),
            const SizedBox(height: SynqSpace.xs),
            Text(body, style: text.bodySmall, textAlign: TextAlign.center),
            if (action != null) ...[const SizedBox(height: SynqSpace.lg), action!],
          ],
        ),
      ),
    );
  }
}

/// Gradient swatch that stands in for an effect in lists (the real renderer runs only full screen).
class EffectSwatch extends StatelessWidget {
  const EffectSwatch({super.key, required this.effect, this.height = 96});
  final EffectDefinition effect;
  final double height;

  @override
  Widget build(BuildContext context) => SizedBox(
    height: height,
    width: double.infinity,
    child: DecoratedBox(
      decoration: BoxDecoration(
        gradient: RadialGradient(
          center: const Alignment(0, 0.6),
          radius: 1.1,
          colors: [effect.accent[0], effect.accent[1].withValues(alpha: 0.55), SynqColors.bg],
          stops: const [0, 0.45, 1],
        ),
      ),
    ),
  );
}
