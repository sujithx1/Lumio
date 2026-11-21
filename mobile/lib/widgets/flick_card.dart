import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../effects/catalog.dart';
import '../theme/tokens.g.dart';
import 'common.dart';

/// A big effect card the user flicks upward, toward the computer, to send.
/// Short or slow drags spring back; a flick throws the card off the screen and calls [onFlick].
class FlickCard extends StatefulWidget {
  const FlickCard({super.key, required this.effect, required this.enabled, required this.onFlick, this.hint});

  final EffectDefinition effect;
  final bool enabled;
  final VoidCallback onFlick;

  /// Shown instead of the flick prompt when sending is not possible.
  final String? hint;

  @override
  State<FlickCard> createState() => _FlickCardState();
}

class _FlickCardState extends State<FlickCard> with SingleTickerProviderStateMixin {
  static const _flickDistance = 70.0;
  static const _flickVelocity = 550.0;

  late final AnimationController _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 380));
  double _drag = 0; // <= 0, pixels dragged upward
  double _from = 0;
  double _to = 0;
  bool _flying = false;

  @override
  void initState() {
    super.initState();
    _anim.addListener(() => setState(() => _drag = _from + (_to - _from) * Curves.easeOutCubic.transform(_anim.value)));
  }

  @override
  void dispose() {
    _anim.dispose();
    super.dispose();
  }

  void _animateTo(double target, {Duration? duration}) {
    _from = _drag;
    _to = target;
    _anim
      ..duration = duration ?? const Duration(milliseconds: 380)
      ..forward(from: 0);
  }

  Future<void> _flick() async {
    _flying = true;
    HapticFeedback.mediumImpact();
    widget.onFlick();
    _animateTo(-900, duration: const Duration(milliseconds: 320));
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    // Come back in from below, ready for another flick.
    setState(() => _drag = 140);
    _animateTo(0, duration: const Duration(milliseconds: 420));
    _flying = false;
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final lift = (-_drag / 900).clamp(0.0, 1.0);
    final ready = -_drag > _flickDistance && !_flying;
    return GestureDetector(
      onVerticalDragUpdate: widget.enabled && !_flying
          ? (d) => setState(() => _drag = (_drag + d.delta.dy).clamp(-260.0, 0.0))
          : null,
      onVerticalDragEnd: widget.enabled && !_flying
          ? (d) {
              final v = d.primaryVelocity ?? 0;
              if (-_drag > _flickDistance || v < -_flickVelocity) {
                _flick();
              } else {
                _animateTo(0);
              }
            }
          : null,
      child: Transform.translate(
        offset: Offset(0, _drag),
        child: Transform.scale(
          scale: 1 - lift * 0.35,
          child: Opacity(
            opacity: (1 - lift * 1.2).clamp(0.0, 1.0),
            child: Container(
              height: 150,
              clipBehavior: Clip.antiAlias,
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(LumioRadius.xl),
                border: Border.all(
                  color: ready ? LumioColors.accentAlt : LumioColors.borderStrong,
                  width: ready ? 2 : 1,
                ),
                boxShadow: [
                  BoxShadow(
                    color: widget.effect.accent[0].withValues(alpha: 0.35 + lift * 0.4),
                    blurRadius: 30 + lift * 30,
                    offset: const Offset(0, 10),
                  ),
                ],
              ),
              child: Stack(
                fit: StackFit.expand,
                children: [
                  EffectSwatch(effect: widget.effect, height: 150),
                  Padding(
                    padding: const EdgeInsets.all(LumioSpace.lg),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(widget.effect.name, style: text.titleLarge?.copyWith(fontWeight: FontWeight.w700)),
                        Text(widget.effect.categoryLabel, style: text.bodySmall?.copyWith(color: LumioColors.text)),
                        const Spacer(),
                        Row(
                          children: [
                            Icon(
                              widget.enabled ? Icons.keyboard_double_arrow_up_rounded : Icons.block_rounded,
                              size: 18,
                              color: LumioColors.text,
                            ),
                            const SizedBox(width: LumioSpace.xs),
                            Flexible(
                              child: Text(
                                widget.enabled
                                    ? (ready ? 'Let go to send' : 'Flick up toward your computer')
                                    : widget.hint ?? '',
                                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
