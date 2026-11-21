import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import '../effects/catalog.dart';
import '../effects/renderers.dart';
import '../theme/tokens.g.dart';

/// Full-screen effect experience. Works in portrait and landscape; tap anywhere to close.
class EffectScreen extends StatefulWidget {
  const EffectScreen({
    super.key,
    required this.effect,
    required this.duration,
    required this.intensity,
    required this.haptics,
    this.fromName,
    required this.onFinished,
  });

  final EffectDefinition effect;
  final int duration;
  final double intensity;
  final bool haptics;
  final String? fromName;

  /// Called exactly once with whether the effect played to the end (or was dismissed) successfully.
  final void Function(bool completed) onFinished;

  @override
  State<EffectScreen> createState() => _EffectScreenState();
}

class _EffectScreenState extends State<EffectScreen> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  final _frame = ValueNotifier<int>(0);
  EffectSim? _sim;
  String? _error;
  Duration _elapsed = Duration.zero;
  Duration _last = Duration.zero;
  bool _done = false;
  bool _showLabel = true;
  Size _size = Size.zero;

  @override
  void initState() {
    super.initState();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
    _ticker = createTicker(_tick);
    unawaited(_load());
    Timer(const Duration(milliseconds: 2600), () {
      if (mounted) setState(() => _showLabel = false);
    });
  }

  Future<void> _load() async {
    final factory = renderers[widget.effect.id];
    try {
      if (factory == null) throw StateError('no renderer');
      _sim = await factory(widget.intensity, widget.haptics);
      if (!mounted) return;
      // Start the clock only once the first frame has actually been painted.
      setState(() {});
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && !_done) _ticker.start();
      });
    } catch (e) {
      debugPrint('effect ${widget.effect.id} failed to start: $e');
      if (!mounted) return;
      setState(() => _error = "This effect couldn't start on this device.");
      Timer(const Duration(milliseconds: 1500), () => _finish(false));
    }
  }

  void _tick(Duration elapsed) {
    final dt = ((elapsed - _last).inMicroseconds / 1e6).clamp(0.0, 0.05);
    _last = elapsed;
    _elapsed = elapsed;
    final progress = (elapsed.inMilliseconds / widget.duration).clamp(0.0, 1.0);
    if (_size != Size.zero) _sim?.update(elapsed.inMicroseconds / 1e6, dt, progress, _size);
    _frame.value++;
    if (elapsed.inMilliseconds >= widget.duration) _finish(true);
  }

  void _finish(bool completed) {
    if (_done) return;
    _done = true;
    _ticker.stop();
    widget.onFinished(completed);
    if (mounted) Navigator.of(context).maybePop();
  }

  @override
  void dispose() {
    _ticker.dispose();
    _sim?.dispose();
    _frame.dispose();
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    if (!_done) widget.onFinished(true);
    super.dispose();
  }

  double get _opacity {
    final ms = _elapsed.inMilliseconds;
    return [1.0, ms / 450, (widget.duration - ms) / 700].reduce((a, b) => a < b ? a : b).clamp(0.0, 1.0);
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return PopScope(
      onPopInvokedWithResult: (didPop, _) {
        if (didPop && !_done) {
          _done = true;
          widget.onFinished(true);
        }
      },
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () => _finish(true),
        // Draws over the app (the route is not opaque) on a dim backdrop, like the desktop overlay.
        child: Material(
          type: MaterialType.transparency,
          child: Stack(
            fit: StackFit.expand,
            children: [
              LayoutBuilder(
                builder: (context, constraints) {
                  _size = constraints.biggest;
                  return ValueListenableBuilder<int>(
                    valueListenable: _frame,
                    builder: (_, _, _) => ColoredBox(
                      // The dim backdrop fades in and out with the effect.
                      color: Color.fromRGBO(0, 0, 0, 0.6 * _opacity),
                      child: Opacity(
                        opacity: _opacity,
                        child: CustomPaint(painter: _SimPainter(_sim, _elapsed, widget.duration), size: _size),
                      ),
                    ),
                  );
                },
              ),
              SafeArea(
                child: Align(
                  alignment: Alignment.topCenter,
                  child: AnimatedOpacity(
                    opacity: _showLabel ? 1 : 0,
                    duration: LumioMotion.slow,
                    child: Container(
                      margin: const EdgeInsets.only(top: LumioSpace.lg),
                      padding: const EdgeInsets.symmetric(horizontal: LumioSpace.lg, vertical: LumioSpace.sm),
                      decoration: BoxDecoration(
                        color: const Color(0x33000000),
                        borderRadius: BorderRadius.circular(LumioRadius.pill),
                        border: Border.all(color: LumioColors.border),
                      ),
                      child: Text.rich(
                        TextSpan(
                          text: widget.effect.name,
                          style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                          children: [
                            if (widget.fromName != null)
                              TextSpan(text: ' · from ${widget.fromName}', style: text.bodySmall),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ),
              if (_error != null)
                Center(
                  child: Text(_error!, style: text.bodyMedium, textAlign: TextAlign.center),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SimPainter extends CustomPainter {
  _SimPainter(this.sim, this.elapsed, this.duration);
  final EffectSim? sim;
  final Duration elapsed;
  final int duration;

  @override
  void paint(Canvas canvas, Size size) {
    sim?.paint(canvas, size, elapsed.inMicroseconds / 1e6, (elapsed.inMilliseconds / duration).clamp(0.0, 1.0));
  }

  @override
  bool shouldRepaint(_SimPainter old) => true;
}
