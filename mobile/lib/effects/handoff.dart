// The handoff: an effect starts on the sender and ends on the receiver.
//
// Sender (this phone): a short DEPARTURE plays over the app from where the effect card was flicked
// and leaves through the TOP edge, the edge facing the computer. The EFFECT_TRIGGER is sent only when
// the departure crosses that edge ([departureSendDelay]), so the computer's arrival follows it.
//
// Receiver (this phone): for every effect except Tiny Ronin (who jumps down himself), an ARRIVAL comet
// drops in from the top edge and bursts as the effect blooms ([ArrivalPainter]).
import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'catalog.dart';
import 'ronin.dart';

/// How long the departure plays on the sender.
const departureDuration = Duration(milliseconds: 1100);

/// When the departure crosses the top edge and the trigger is sent.
const departureSendDelay = Duration(milliseconds: 650);

/// How long the arrival comet is visible on the receiver.
const arrivalDuration = Duration(milliseconds: 850);

/// Seconds into the arrival when the comet bursts.
const arrivalBurstAt = 0.5;

const _roninId = 'tiny-ronin';

double _clamp01(double x) => x.clamp(0.0, 1.0);
double _phase(double t, double a, double b) => _clamp01((t - a) / (b - a));

/// Plays the departure for [effect] from [origin] (global coordinates; defaults to the lower middle of
/// the screen) without blocking input. Returns when it has finished.
Future<void> playDeparture(BuildContext context, EffectDefinition effect, {Offset? origin}) {
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return Future.value();
  final done = Completer<void>();
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => IgnorePointer(
      child: _Departure(
        effect: effect,
        origin: origin,
        onDone: () {
          entry.remove();
          if (!done.isCompleted) done.complete();
        },
      ),
    ),
  );
  overlay.insert(entry);
  return done.future;
}

/// Plays the departure and runs [send] once it crosses the top edge. The returned future completes
/// with [send]'s result (or error); the UI is never blocked while waiting.
Future<T> departThen<T>(
  BuildContext context,
  EffectDefinition effect,
  Future<T> Function() send, {
  Offset? origin,
}) async {
  unawaited(playDeparture(context, effect, origin: origin));
  await Future<void>.delayed(departureSendDelay);
  return send();
}

/// The global centre of the widget with [key], if it is laid out.
Offset? globalCenterOf(GlobalKey key) {
  final box = key.currentContext?.findRenderObject();
  if (box is! RenderBox || !box.hasSize || !box.attached) return null;
  return box.localToGlobal(box.size.center(Offset.zero));
}

class _Departure extends StatefulWidget {
  const _Departure({required this.effect, required this.onDone, this.origin});
  final EffectDefinition effect;
  final Offset? origin;
  final VoidCallback onDone;

  @override
  State<_Departure> createState() => _DepartureState();
}

class _DepartureState extends State<_Departure> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(vsync: this, duration: departureDuration)
    ..addStatusListener((s) {
      if (s == AnimationStatus.completed) widget.onDone();
    })
    ..forward();

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => SizedBox.expand(
    child: CustomPaint(
      painter: DeparturePainter(
        effect: widget.effect,
        origin: widget.origin,
        time: _c,
      ),
    ),
  );
}

/// Paints the departure at `time.value * departureDuration`.
class DeparturePainter extends CustomPainter {
  DeparturePainter({required this.effect, required this.time, this.origin}) : super(repaint: time);
  final EffectDefinition effect;
  final Animation<double> time;
  final Offset? origin;

  @override
  void paint(Canvas canvas, Size size) {
    final t = time.value * departureDuration.inMilliseconds / 1000;
    final from = origin ?? Offset(size.width / 2, size.height * 0.72);
    if (effect.id == _roninId) {
      paintRoninDeparture(canvas, size, from, t);
    } else {
      paintCometDeparture(canvas, size, from, t, effect.accent);
    }
  }

  @override
  bool shouldRepaint(DeparturePainter old) => old.effect != effect || old.origin != origin;
}

/// A glowing orb (accent[0] core, accent[1] trail) that pulses at [from] and whooshes up off the top.
void paintCometDeparture(Canvas canvas, Size size, Offset from, double t, List<Color> accent) {
  final m = math.min(size.width, size.height);
  final r = m * 0.07;
  final launch = _phase(t, 0.25, 0.65);
  Offset at(double u) {
    final e = u * u * (3 - 2 * u) * 0.35 + u * u * 0.65; // eases in, keeps accelerating
    return Offset(from.dx + math.sin(u * math.pi) * size.width * 0.08, from.dy + (-r * 3 - from.dy) * e);
  }

  final pulse = launch == 0 ? 1 + 0.12 * math.sin(t * 40) : 1.0;
  final appear = _clamp01(t / 0.12);
  final head = at(launch);
  final fade = 1 - _phase(t, 0.65, 1.05);

  // Trail: a tapered ribbon through the positions it already passed.
  if (launch > 0) {
    const n = 18;
    for (var k = n; k >= 1; k--) {
      final u = launch - k * 0.03;
      if (u < 0) continue;
      final a = at(u), b = at(launch - (k - 1) * 0.03);
      final w = r * 1.6 * (1 - k / n);
      canvas.drawLine(
        a,
        b,
        Paint()
          ..color = accent[1].withValues(alpha: 0.55 * (1 - k / n) * fade)
          ..strokeWidth = w + 1
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
      );
      if (k.isEven) {
        paintTwinkle(
          canvas,
          a + Offset(math.sin(k * 2.1) * r * 1.2, math.cos(k * 1.3) * r * 0.6),
          r * 0.35 * (1 - k / n) + 1.5,
          k % 4 == 0 ? Colors.white : accent[0],
          (1 - k / n) * fade,
        );
      }
    }
  }

  // Orbiting sparkles while it charges.
  if (launch < 0.4) {
    for (var k = 0; k < 5; k++) {
      final a = t * 9 + k * math.pi * 2 / 5;
      paintTwinkle(canvas, head + Offset(math.cos(a), math.sin(a)) * r * 1.7, r * 0.25, Colors.white,
          appear * (1 - launch * 2.5));
    }
  }

  if (launch < 1) {
    final rr = r * pulse * appear;
    canvas
      ..drawCircle(
        head,
        rr * 2.2,
        Paint()
          ..shader = RadialGradient(colors: [
            accent[0].withValues(alpha: 0.55),
            accent[1].withValues(alpha: 0.18),
            accent[1].withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: head, radius: rr * 2.2)),
      )
      ..drawCircle(head, rr, Paint()..color = accent[0])
      ..drawCircle(head, rr * 0.55, Paint()..color = Color.lerp(accent[0], Colors.white, 0.75)!);
  }

  // Flash on the top edge where it leaves.
  final flash = _phase(t, 0.58, 0.95);
  if (flash > 0 && flash < 1) {
    final s = math.sin(flash * math.pi);
    final p = Offset(at(1).dx, 0);
    final radius = r * (2.5 + flash * 3);
    canvas.drawCircle(
      p,
      radius,
      Paint()
        ..shader = RadialGradient(colors: [
          Colors.white.withValues(alpha: 0.85 * s),
          accent[0].withValues(alpha: 0.4 * s),
          accent[0].withValues(alpha: 0),
        ]).createShader(Rect.fromCircle(center: p, radius: radius)),
    );
  }
}

/// The receiver's arrival: a comet drops in from the top edge and bursts at [arrivalBurstAt] seconds.
/// Paints nothing for Tiny Ronin, whose own jump-down is the arrival.
class ArrivalPainter extends CustomPainter {
  ArrivalPainter({required this.effect, required this.seconds});
  final EffectDefinition effect;
  final double seconds;

  static bool appliesTo(EffectDefinition effect) => effect.id != _roninId;

  @override
  void paint(Canvas canvas, Size size) {
    if (!appliesTo(effect)) return;
    paintCometArrival(canvas, size, seconds, effect.accent);
  }

  @override
  bool shouldRepaint(ArrivalPainter old) => old.seconds != seconds || old.effect != effect;
}

void paintCometArrival(Canvas canvas, Size size, double t, List<Color> accent) {
  final end = arrivalDuration.inMilliseconds / 1000;
  if (t >= end) return;
  final m = math.min(size.width, size.height);
  final r = m * 0.065;
  final target = Offset(size.width / 2, size.height * 0.42);
  final fall = _clamp01(t / arrivalBurstAt);
  Offset at(double u) => Offset(target.dx, -r * 3 + (target.dy + r * 3) * u * u);

  if (fall < 1) {
    // Entry flash on the top edge, trail, then the orb.
    final entry = math.sin(_phase(t, 0, 0.3) * math.pi);
    if (entry > 0) {
      canvas.drawCircle(
        Offset(target.dx, 0),
        r * 3,
        Paint()
          ..shader = RadialGradient(colors: [
            Colors.white.withValues(alpha: 0.7 * entry),
            accent[0].withValues(alpha: 0.3 * entry),
            accent[0].withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: Offset(target.dx, 0), radius: r * 3)),
      );
    }
    for (var k = 14; k >= 1; k--) {
      final u = fall - k * 0.035;
      if (u < 0) continue;
      canvas.drawLine(
        at(u),
        at(fall - (k - 1) * 0.035),
        Paint()
          ..color = accent[1].withValues(alpha: 0.55 * (1 - k / 14))
          ..strokeWidth = r * 1.5 * (1 - k / 14) + 1
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
      );
    }
    final head = at(fall);
    canvas
      ..drawCircle(
        head,
        r * 2.2,
        Paint()
          ..shader = RadialGradient(colors: [
            accent[0].withValues(alpha: 0.55),
            accent[1].withValues(alpha: 0.18),
            accent[1].withValues(alpha: 0),
          ]).createShader(Rect.fromCircle(center: head, radius: r * 2.2)),
      )
      ..drawCircle(head, r, Paint()..color = accent[0])
      ..drawCircle(head, r * 0.55, Paint()..color = Color.lerp(accent[0], Colors.white, 0.75)!);
    return;
  }

  // Burst: an expanding ring and radial sparkles.
  final b = _phase(t, arrivalBurstAt, end);
  final ease = 1 - math.pow(1 - b, 3).toDouble();
  final alpha = 1 - b;
  canvas
    ..drawCircle(
      target,
      r * (1 + ease * 6),
      Paint()
        ..color = accent[0].withValues(alpha: 0.8 * alpha)
        ..style = PaintingStyle.stroke
        ..strokeWidth = r * 0.5 * alpha + 1
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 3),
    )
    ..drawCircle(target, r * (1.2 - b), Paint()..color = Colors.white.withValues(alpha: alpha));
  for (var k = 0; k < 12; k++) {
    final a = k * math.pi / 6 + 0.3;
    paintTwinkle(
      canvas,
      target + Offset(math.cos(a), math.sin(a)) * r * (1.5 + ease * 5),
      r * 0.4 * alpha + 1,
      k.isEven ? Colors.white : accent[1],
      alpha,
    );
  }
}
