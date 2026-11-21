import 'package:flutter/material.dart';

import '../app.dart';
import '../effects/catalog.dart';
import '../theme/tokens.g.dart';
import '../widgets/common.dart';
import 'effect_screen.dart';

class EffectsScreen extends StatelessWidget {
  const EffectsScreen({super.key, required this.onSend});
  final void Function({String? effectId, String? deviceId}) onSend;

  void _preview(BuildContext context, EffectDefinition e) => Navigator.of(context).push(
    MaterialPageRoute<void>(
      fullscreenDialog: true,
      builder: (_) => EffectScreen(
        effect: e,
        duration: e.defaultDuration,
        intensity: e.defaultIntensity,
        haptics: e.hasSound,
        onFinished: (_) {},
      ),
    ),
  );

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final text = Theme.of(context).textTheme;
    final canSend = engine.peers.isNotEmpty;
    return SafeArea(
      child: CustomScrollView(
        slivers: [
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(LumioSpace.xl, LumioSpace.lg, LumioSpace.xl, LumioSpace.lg),
            sliver: SliverList.list(
              children: [
                Text('Effects', style: text.headlineMedium),
                const SizedBox(height: LumioSpace.xs),
                Text('Tap to send. Long-press to preview on this phone.', style: text.bodySmall),
              ],
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.fromLTRB(LumioSpace.xl, 0, LumioSpace.xl, LumioSpace.xxxl),
            sliver: SliverGrid.builder(
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 240,
                mainAxisSpacing: LumioSpace.md,
                crossAxisSpacing: LumioSpace.md,
                childAspectRatio: 0.78,
              ),
              itemCount: engine.catalog.effects.length,
              itemBuilder: (_, i) {
                final e = engine.catalog.effects[i];
                return Card(
                  clipBehavior: Clip.antiAlias,
                  child: InkWell(
                    onTap: canSend ? () => onSend(effectId: e.id) : () => _preview(context, e),
                    onLongPress: () => _preview(context, e),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: EffectSwatch(effect: e, height: double.infinity),
                        ),
                        Padding(
                          padding: const EdgeInsets.fromLTRB(LumioSpace.md, LumioSpace.sm, LumioSpace.md, LumioSpace.md),
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(e.name, style: text.titleMedium?.copyWith(fontSize: 14)),
                              const SizedBox(height: 2),
                              Text('${e.categoryLabel} · ${e.durationLabel}', style: text.bodySmall),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
