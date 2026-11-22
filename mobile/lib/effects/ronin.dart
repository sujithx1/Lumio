// Tiny Ronin: an original chibi swordsman (headband, white gi, indigo hakama, one katana).
// The figure is drawn with plain shapes by [paintRonin], shared by the effect ([TinyRoninSim]) and by
// the sender's departure animation (effects/handoff.dart).
import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';

import 'renderers.dart' show EffectSim;

// Palette (keep in sync with desktop/src/effects/renderers/ronin.ts).
const roninSkin = Color(0xFFFFD7B5);
const roninSkinShade = Color(0xFFF2B48C);
const roninEye = Color(0xFF1F2937);
const roninBlush = Color(0xFFFDA4AF);
const roninHair = Color(0xFF1E293B);
const roninBand = Color(0xFFEF4444);
const roninBandDark = Color(0xFFB91C1C);
const roninGi = Color(0xFFF8FAFC);
const roninGiShade = Color(0xFFDDE3EC);
const roninCollar = Color(0xFF6366F1);
const roninHakama = Color(0xFF4338CA);
const roninHakamaDark = Color(0xFF312E81);
const roninSandal = Color(0xFF92400E);
const roninScabbard = Color(0xFF7C2D12);
const roninGuard = Color(0xFFFACC15);
const roninBlade = Color(0xFFE2E8F0);
const roninSlash = Color(0xFF38BDF8);
const roninPetals = [Color(0xFFFBCFE8), Color(0xFFF9A8D4)];
const roninHeart = Color(0xFFF472B6);

/// How the figure is posed for one frame.
class RoninPose {
  const RoninPose({
    this.facing = 1,
    this.run,
    this.sword = false,
    this.arm = 0,
    this.blink = 0,
    this.happy = false,
    this.bow = 0,
    this.squash = 1,
    this.t = 0,
  });

  /// 1 faces right, -1 faces left.
  final double facing;

  /// Run-cycle phase in radians; null when standing.
  final double? run;

  /// Sword drawn (held in the front hand) or sheathed at the hip.
  final bool sword;

  /// Sword-arm angle in radians, 0 = pointing forward, negative = raised.
  final double arm;

  /// 0 = eyes open, 1 = closed (drawn as happy ^ ^ arcs).
  final double blink;

  /// "w" mouth instead of a small smile.
  final bool happy;

  /// 0..1 forward bow of the head and body.
  final double bow;

  /// Vertical squash (< 1) or stretch (> 1), anchored at the feet.
  final double squash;

  /// Time in seconds, for the headband tails.
  final double t;
}

Paint _fill(Color c) => Paint()..color = c;
Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

/// Draws the ronin with his feet at [feet], [height] pixels tall (hair tufts reach a little higher).
void paintRonin(Canvas canvas, Offset feet, double height, RoninPose pose) {
  final h = height;
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.facing / pose.squash.clamp(0.6, 1.6), pose.squash);

  final runPhase = pose.run;
  final legSwing = runPhase == null ? 0.0 : math.sin(runPhase) * 0.6;
  final bob = runPhase == null ? 0.0 : -math.sin(runPhase * 2).abs() * h * 0.03;
  canvas.translate(0, bob);

  // Bowing pivots the upper body around the waist.
  final waist = Offset(0, -0.31 * h);

  // ---- legs (hakama) and sandals
  for (final side in [-1.0, 1.0]) {
    final angle = legSwing * side;
    canvas
      ..save()
      ..translate(side * 0.05 * h, waist.dy)
      ..rotate(angle);
    final leg = RRect.fromRectAndCorners(
      Rect.fromLTWH(-0.085 * h, 0, 0.17 * h, 0.27 * h),
      topLeft: Radius.circular(0.03 * h),
      topRight: Radius.circular(0.03 * h),
      bottomLeft: Radius.circular(0.06 * h),
      bottomRight: Radius.circular(0.06 * h),
    );
    canvas
      ..drawRRect(leg, _fill(side < 0 ? roninHakamaDark : roninHakama))
      ..drawLine(Offset(0.01 * h, 0.05 * h), Offset(0.015 * h, 0.24 * h), _stroke(roninHakamaDark, 0.012 * h))
      ..drawOval(Rect.fromCenter(center: Offset(0.03 * h, 0.29 * h), width: 0.15 * h, height: 0.055 * h), _fill(roninSandal))
      ..restore();
  }

  canvas
    ..save()
    ..translate(waist.dx, waist.dy)
    ..rotate(pose.bow * 0.3)
    ..translate(-waist.dx, -waist.dy);

  // ---- scabbard behind the body (always worn), handle forward
  final hip = Offset(0.02 * h, -0.33 * h);
  canvas.drawLine(hip, hip + Offset(-0.34 * h, 0.12 * h), _stroke(roninScabbard, 0.045 * h));
  if (!pose.sword) {
    canvas
      ..drawLine(hip, hip + Offset(0.13 * h, -0.045 * h), _stroke(roninEye, 0.04 * h))
      ..drawCircle(hip + Offset(0.005 * h, 0), 0.03 * h, _fill(roninGuard));
  }

  // ---- back arm
  final shoulder = Offset(0, -0.47 * h);
  final backArm = runPhase == null ? 0.35 : 0.35 - legSwing * 0.9;
  _arm(canvas, shoulder + Offset(-0.06 * h, 0), math.pi / 2 + backArm, h, roninGiShade);

  // ---- torso (gi) with collar and belt
  final torso = RRect.fromRectAndRadius(
    Rect.fromCenter(center: Offset(0, -0.4 * h), width: 0.3 * h, height: 0.2 * h),
    Radius.circular(0.07 * h),
  );
  canvas
    ..drawRRect(torso, _fill(roninGi))
    ..drawPath(
      Path()
        ..moveTo(-0.07 * h, -0.5 * h)
        ..lineTo(0.015 * h, -0.38 * h)
        ..lineTo(0.08 * h, -0.5 * h),
      _stroke(roninCollar, 0.03 * h),
    )
    ..drawLine(Offset(-0.15 * h, -0.315 * h), Offset(0.15 * h, -0.315 * h), _stroke(roninHakamaDark, 0.035 * h));

  // ---- front (sword) arm
  if (pose.sword) {
    final dir = Offset(math.cos(pose.arm), math.sin(pose.arm));
    final hand = shoulder + Offset(0.05 * h, 0) + dir * 0.15 * h;
    _arm(canvas, shoulder + Offset(0.05 * h, 0), pose.arm, h, roninGi);
    final hiltEnd = hand + dir * 0.07 * h;
    final tip = hiltEnd + dir * 0.46 * h;
    final normal = Offset(-dir.dy, dir.dx);
    canvas
      ..drawLine(hand - dir * 0.03 * h, hiltEnd, _stroke(roninEye, 0.04 * h))
      ..drawLine(hiltEnd - normal * 0.04 * h, hiltEnd + normal * 0.04 * h, _stroke(roninGuard, 0.03 * h))
      ..drawPath(
        Path()
          ..moveTo(hiltEnd.dx + normal.dx * 0.018 * h, hiltEnd.dy + normal.dy * 0.018 * h)
          ..lineTo(tip.dx, tip.dy)
          ..lineTo(hiltEnd.dx - normal.dx * 0.018 * h, hiltEnd.dy - normal.dy * 0.018 * h)
          ..close(),
        _fill(roninBlade),
      )
      ..drawLine(hiltEnd + normal * 0.012 * h, tip, _stroke(const Color(0xFFFFFFFF), 0.008 * h))
      ..drawCircle(hand, 0.038 * h, _fill(roninSkin));
  } else {
    final frontArm = runPhase == null ? -0.2 : 0.35 + legSwing * 0.9;
    final standing = runPhase == null;
    // Standing: the hand rests on the hilt.
    _arm(canvas, shoulder + Offset(0.05 * h, 0), standing ? math.pi / 2 - 0.55 : math.pi / 2 + frontArm, h, roninGi);
  }

  // ---- head
  final c = Offset(0.01 * h, -0.73 * h);
  final r = 0.27 * h;
  canvas
    ..save()
    ..translate(c.dx, c.dy + r * 0.9)
    ..rotate(pose.bow * 0.22)
    ..translate(-c.dx, -(c.dy + r * 0.9));

  // Headband tails flutter behind the head.
  for (var k = 0; k < 2; k++) {
    final base = c + Offset(-r * 0.85, -r * 0.3 + k * r * 0.14);
    final wave = math.sin(pose.t * 9 + k * 1.7);
    final len = r * (1.55 - k * 0.3);
    final tail = Path()
      ..moveTo(base.dx, base.dy)
      ..quadraticBezierTo(
        base.dx - len * 0.5,
        base.dy + wave * r * 0.25 - r * 0.1,
        base.dx - len,
        base.dy + math.sin(pose.t * 9 + k * 1.7 + 1.2) * r * 0.3 + r * 0.05,
      );
    canvas.drawPath(tail, _stroke(k == 0 ? roninBand : roninBandDark, r * 0.2));
  }

  canvas
    ..drawCircle(c + Offset(0, r * 0.04), r, _fill(roninSkinShade))
    ..drawCircle(c, r, _fill(roninSkin));

  // Hair: a cap over the top of the head with rounded spiky tufts and a few bangs.
  final hair = Path()
    ..addArc(Rect.fromCircle(center: c, radius: r * 1.03), math.pi * 1.02, math.pi * 0.96)
    ..close();
  canvas.drawPath(hair, _fill(roninHair));
  for (final (dx, dy, rr) in [(-0.62, -0.78, 0.26), (-0.22, -1.02, 0.3), (0.22, -1.04, 0.28), (0.6, -0.8, 0.24)]) {
    final tip = c + Offset(dx * r * 1.3, dy * r * 1.32);
    final from = c + Offset(dx * r * 0.6, dy * r * 0.55);
    final normal = Offset(-(tip.dy - from.dy), tip.dx - from.dx);
    final n = normal / normal.distance * rr * r;
    canvas.drawPath(
      Path()
        ..moveTo(from.dx + n.dx, from.dy + n.dy)
        ..quadraticBezierTo(tip.dx + n.dx * 0.3, tip.dy + n.dy * 0.3, tip.dx, tip.dy)
        ..quadraticBezierTo(tip.dx - n.dx * 0.3, tip.dy - n.dy * 0.3, from.dx - n.dx, from.dy - n.dy)
        ..close(),
      _fill(roninHair),
    );
  }
  for (final bx in [-0.5, -0.1, 0.3]) {
    canvas.drawPath(
      Path()
        ..moveTo(c.dx + (bx - 0.22) * r, c.dy - r * 0.42)
        ..quadraticBezierTo(c.dx + (bx + 0.05) * r, c.dy - r * 0.3, c.dx + (bx + 0.12) * r, c.dy - r * 0.08)
        ..quadraticBezierTo(c.dx + (bx + 0.14) * r, c.dy - r * 0.32, c.dx + (bx + 0.3) * r, c.dy - r * 0.42)
        ..close(),
      _fill(roninHair),
    );
  }

  // Headband across the forehead.
  canvas
    ..save()
    ..clipPath(Path()..addOval(Rect.fromCircle(center: c, radius: r * 1.01)));
  canvas
    ..drawRect(Rect.fromLTRB(c.dx - r * 1.1, c.dy - r * 0.5, c.dx + r * 1.1, c.dy - r * 0.3), _fill(roninBand))
    ..drawRect(Rect.fromLTRB(c.dx - r * 1.1, c.dy - r * 0.33, c.dx + r * 1.1, c.dy - r * 0.3), _fill(roninBandDark))
    ..restore();
  canvas.drawCircle(c + Offset(-r * 0.86, -r * 0.33), r * 0.12, _fill(roninBandDark));

  // Face, shifted toward the facing side.
  final face = c + Offset(r * 0.14, r * 0.1);
  for (final side in [-1.0, 1.0]) {
    final eye = face + Offset(side * r * 0.36, 0);
    final open = (1 - pose.blink).clamp(0.0, 1.0);
    if (open > 0.15) {
      final ew = r * 0.26, eh = r * 0.38 * open;
      canvas
        ..drawOval(Rect.fromCenter(center: eye, width: ew, height: eh), _fill(roninEye))
        ..drawCircle(eye + Offset(-ew * 0.18, -eh * 0.2), ew * 0.24, _fill(const Color(0xFFFFFFFF)))
        ..drawCircle(eye + Offset(ew * 0.18, eh * 0.2), ew * 0.11, _fill(const Color(0xFFFFFFFF)));
    } else {
      // Closed eyes read as a happy ^ ^.
      canvas.drawArc(
        Rect.fromCenter(center: eye + Offset(0, r * 0.05), width: r * 0.26, height: r * 0.2),
        math.pi * 1.1,
        math.pi * 0.8,
        false,
        _stroke(roninEye, r * 0.06),
      );
    }
    canvas.drawOval(
      Rect.fromCenter(center: face + Offset(side * r * 0.6, r * 0.32), width: r * 0.24, height: r * 0.13),
      _fill(roninBlush.withValues(alpha: 0.8)),
    );
  }
  final mouth = face + Offset(0, r * 0.36);
  if (pose.happy) {
    final w = r * 0.09;
    canvas.drawPath(
      Path()
        ..moveTo(mouth.dx - w * 2, mouth.dy - w * 0.4)
        ..quadraticBezierTo(mouth.dx - w, mouth.dy + w * 1.4, mouth.dx, mouth.dy - w * 0.2)
        ..quadraticBezierTo(mouth.dx + w, mouth.dy + w * 1.4, mouth.dx + w * 2, mouth.dy - w * 0.4),
      _stroke(roninEye, r * 0.045),
    );
  } else {
    canvas.drawArc(
      Rect.fromCenter(center: mouth, width: r * 0.2, height: r * 0.12),
      0.2,
      math.pi - 0.4,
      false,
      _stroke(roninEye, r * 0.045),
    );
  }

  canvas
    ..restore() // head tilt
    ..restore() // bow
    ..restore(); // placement
}

void _arm(Canvas canvas, Offset shoulder, double angle, double h, Color sleeve) {
  final dir = Offset(math.cos(angle), math.sin(angle));
  final hand = shoulder + dir * 0.15 * h;
  canvas
    ..drawLine(shoulder, hand, _stroke(sleeve, 0.075 * h))
    ..drawCircle(hand, 0.035 * h, _fill(roninSkin));
}

/// A cherry petal: two arcs meeting at a notched tip.
void paintPetal(Canvas canvas, Offset at, double size, double rotation, Color color, double alpha) {
  canvas
    ..save()
    ..translate(at.dx, at.dy)
    ..rotate(rotation);
  final s = size;
  canvas
    ..drawPath(
      Path()
        ..moveTo(0, s * 0.55)
        ..quadraticBezierTo(-s * 0.6, 0, -s * 0.12, -s * 0.5)
        ..lineTo(0, -s * 0.36)
        ..lineTo(s * 0.12, -s * 0.5)
        ..quadraticBezierTo(s * 0.6, 0, 0, s * 0.55)
        ..close(),
      _fill(color.withValues(alpha: alpha)),
    )
    ..restore();
}

/// A four-point twinkle.
void paintTwinkle(Canvas canvas, Offset at, double r, Color color, double alpha) {
  final p = Path()
    ..moveTo(at.dx, at.dy - r)
    ..quadraticBezierTo(at.dx, at.dy, at.dx + r, at.dy)
    ..quadraticBezierTo(at.dx, at.dy, at.dx, at.dy + r)
    ..quadraticBezierTo(at.dx, at.dy, at.dx - r, at.dy)
    ..quadraticBezierTo(at.dx, at.dy, at.dx, at.dy - r)
    ..close();
  canvas.drawPath(p, _fill(color.withValues(alpha: alpha.clamp(0.0, 1.0))));
}

void _heart(Canvas canvas, Offset at, double s, double alpha) {
  final p = Path()
    ..moveTo(at.dx, at.dy + s * 0.35)
    ..cubicTo(at.dx - s * 0.9, at.dy - s * 0.25, at.dx - s * 0.35, at.dy - s * 0.85, at.dx, at.dy - s * 0.3)
    ..cubicTo(at.dx + s * 0.35, at.dy - s * 0.85, at.dx + s * 0.9, at.dy - s * 0.25, at.dx, at.dy + s * 0.35)
    ..close();
  canvas.drawPath(p, _fill(roninHeart.withValues(alpha: alpha)));
}

double _clamp01(double x) => x.clamp(0.0, 1.0);
double _phase(double p, double a, double b) => _clamp01((p - a) / (b - a));
double _easeOutCubic(double x) => 1 - math.pow(1 - _clamp01(x), 3).toDouble();
double _easeInOut(double x) {
  final v = _clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - math.pow(-2 * v + 2, 3) / 2;
}

class _Bit {
  _Bit(this.pos, this.vel, this.life, this.size, this.kind, {this.spin = 0, this.rot = 0, this.color = 0})
    : maxLife = life;
  Offset pos;
  Offset vel;
  double life;
  final double maxLife;
  final double size;
  final int kind; // 0 petal, 1 twinkle, 2 dust
  final double spin;
  double rot;
  final int color;
}

/// One sword stroke: a crescent across the screen.
class _Slash {
  const _Slash(this.start, this.end, this.from, this.to, this.bend);
  final double start; // progress window
  final double end;
  final Offset from; // as fractions of the screen
  final Offset to;
  final double bend; // sagitta as a fraction of the chord

  double swing(double p) => _phase(p, start + (end - start) * 0.25, start + (end - start) * 0.6);

  List<Offset> points(Size s, int n) {
    final a = Offset(from.dx * s.width, from.dy * s.height);
    final b = Offset(to.dx * s.width, to.dy * s.height);
    final mid = (a + b) / 2;
    final d = b - a;
    final normal = Offset(-d.dy, d.dx) / d.distance;
    final ctrl = mid + normal * d.distance * bend * 2;
    return [
      for (var i = 0; i <= n; i++)
        () {
          final u = i / n;
          return a * ((1 - u) * (1 - u)) + ctrl * (2 * u * (1 - u)) + b * (u * u);
        }(),
    ];
  }
}

/// The phone version of Tiny Ronin. He drops in from the TOP edge (the edge facing the computer),
/// poses, slices three sparkling crescents across the screen, bows and dashes off the side.
class TinyRoninSim extends EffectSim {
  TinyRoninSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;

  static const _slashes = [
    // Kept clear of the figure (centre-left, ~43%–67% of the height) so his face stays visible.
    _Slash(0.28, 0.40, Offset(0.04, 0.36), Offset(0.97, 0.13), -0.12), // rising, above him
    _Slash(0.39, 0.51, Offset(0.97, 0.79), Offset(0.03, 0.86), 0.06), // low and level, below his feet
    _Slash(0.50, 0.62, Offset(0.02, 0.1), Offset(0.98, 0.39), -0.1), // falling, above him
  ];

  final _rng = math.Random(7);
  final _bits = <_Bit>[];
  final _fired = <int>{};
  bool _landed = false;
  double _petalTimer = 0;
  Size _size = Size.zero;

  double _r(double a, double b) => a + _rng.nextDouble() * (b - a);

  double _figure(Size s) => math.min(s.width * 0.5, s.height * 0.3);
  double _landY(Size s) => s.height * 0.55 + _figure(s) * 0.5;
  double _homeX(Size s) => s.width * 0.42;

  /// Feet position for this moment.
  Offset _feet(double p) {
    final s = _size;
    final fh = _figure(s);
    if (p < 0.13) {
      final u = p / 0.13;
      return Offset(_homeX(s) - s.width * 0.08 * (1 - u), -fh * 0.15 + (_landY(s) + fh * 0.15) * u * u);
    }
    var y = _landY(s);
    final hop = _phase(p, 0.235, 0.285);
    if (hop > 0 && hop < 1) y -= math.sin(hop * math.pi) * fh * 0.14;
    if (p < 0.78) return Offset(_homeX(s), y);
    final dash = _easeInOut(_phase(p, 0.8, 0.98));
    return Offset(_homeX(s) + (s.width * 0.58 + fh) * dash, y);
  }

  @override
  void update(double t, double dt, double progress, Size size) {
    _size = size;
    final fh = _figure(size);
    final feet = _feet(progress);

    // Sparkle trail while falling in from the top.
    if (progress < 0.13) {
      for (var i = 0; i < 2; i++) {
        _bits.add(_Bit(feet + Offset(_r(-fh * 0.3, fh * 0.3), -fh * _r(0.2, 0.9)), Offset(_r(-20, 20), _r(-60, -10)),
            _r(0.4, 0.8), _r(4, 9), 1, color: i));
      }
    }
    if (!_landed && progress >= 0.13) {
      _landed = true;
      if (haptics) HapticFeedback.lightImpact();
      for (var i = 0; i < 12; i++) {
        final dir = i.isEven ? -1.0 : 1.0;
        _bits.add(_Bit(feet + Offset(dir * _r(0, fh * 0.2), -2), Offset(dir * _r(40, 140), -_r(10, 60)), _r(0.4, 0.8),
            _r(8, 16), 2));
      }
    }
    // Dust while dashing off.
    if (progress > 0.8 && progress < 0.98 && _rng.nextDouble() < 0.6) {
      _bits.add(_Bit(feet + Offset(-fh * 0.1, -3), Offset(-_r(40, 120), -_r(5, 40)), _r(0.3, 0.6), _r(6, 12), 2));
    }

    for (final (i, slash) in _slashes.indexed) {
      if (!_fired.contains(i) && slash.swing(progress) >= 0.5) {
        _fired.add(i);
        if (haptics) HapticFeedback.mediumImpact();
        final pts = slash.points(size, 24);
        final petals = (14 + 22 * intensity).round();
        for (var k = 0; k < petals; k++) {
          final at = pts[_rng.nextInt(pts.length)];
          _bits.add(_Bit(at, Offset(_r(-160, 160), _r(-220, 40)), _r(1.4, 2.6), _r(7, 12), 0,
              spin: _r(-4, 4), rot: _r(0, 6), color: _rng.nextInt(2)));
        }
        for (var k = 0; k < 18; k++) {
          final at = pts[_rng.nextInt(pts.length)];
          _bits.add(_Bit(at, Offset(_r(-50, 50), _r(-50, 50)), _r(0.3, 0.8), _r(4, 10), 1, color: k % 2));
        }
      }
    }

    // A gentle petal fall after the first slash.
    if (_fired.isNotEmpty && progress < 0.92) {
      _petalTimer -= dt;
      if (_petalTimer <= 0) {
        _petalTimer = _r(0.05, 0.14) / (0.5 + intensity);
        _bits.add(_Bit(Offset(_r(0, size.width), -10), Offset(_r(-30, 30), _r(50, 110)), _r(4, 7), _r(7, 11), 0,
            spin: _r(-3, 3), rot: _r(0, 6), color: _rng.nextInt(2)));
      }
    }

    for (final b in _bits) {
      b.life -= dt;
      b.rot += b.spin * dt;
      if (b.kind == 0) {
        b.vel = Offset(b.vel.dx * 0.985 + math.sin(t * 2 + b.rot) * 6, math.min(b.vel.dy + 140 * dt, 120));
      } else if (b.kind == 2) {
        b.vel = b.vel * 0.94;
      }
      b.pos += b.vel * dt;
    }
    _bits.removeWhere((b) => b.life <= 0 || b.pos.dy > size.height + 40);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    _size = size;
    final fh = _figure(size);

    // Dust first, then slashes, petals and twinkles, then the ronin on top.
    for (final b in _bits.where((b) => b.kind == 2)) {
      final a = _clamp01(b.life / b.maxLife);
      canvas.drawCircle(b.pos, b.size * (1.6 - a * 0.6), _fill(Color.fromRGBO(226, 232, 240, 0.45 * a)));
    }

    for (final slash in _slashes) {
      _paintSlash(canvas, size, slash, progress);
    }

    // Petals and twinkles stay behind him so they never cover his face.
    for (final b in _bits.where((b) => b.kind != 2)) {
      final a = _clamp01(b.life / b.maxLife * 1.5);
      if (b.kind == 0) {
        paintPetal(canvas, b.pos, b.size, b.rot, roninPetals[b.color], a);
      } else {
        paintTwinkle(canvas, b.pos, b.size * a, b.color == 0 ? const Color(0xFFFFFFFF) : const Color(0xFFBAE6FD), a);
      }
    }

    final feet = _feet(progress);
    final pose = _pose(progress, t);
    paintRonin(canvas, feet, fh, pose);

    // A sparkle pops by his head during the pose, and a heart during the bow.
    final pose2 = _phase(progress, 0.2, 0.28);
    if (pose2 > 0 && pose2 < 1) {
      final s = math.sin(pose2 * math.pi);
      paintTwinkle(canvas, feet + Offset(fh * 0.38, -fh * 1.08), fh * 0.12 * s, const Color(0xFFFDE68A), s);
      paintTwinkle(canvas, feet + Offset(fh * 0.5, -fh * 0.9), fh * 0.06 * s, const Color(0xFFFFFFFF), s);
    }
    final heart = _phase(progress, 0.68, 0.8);
    if (heart > 0 && heart < 1) {
      final pop = heart < 0.3 ? _easeOutCubic(heart / 0.3) : 1.0;
      _heart(canvas, feet + Offset(fh * 0.3, -fh * (1.1 + heart * 0.25)), fh * 0.14 * pop, 1 - _phase(heart, 0.7, 1));
    }

  }

  RoninPose _pose(double p, double t) {
    if (p < 0.13) return RoninPose(blink: 0, happy: true, squash: 1.08, t: t);
    if (p < 0.18) {
      final u = _phase(p, 0.13, 0.18);
      final squash = u < 0.4 ? 1 - 0.22 * math.sin(u / 0.4 * math.pi / 2) : 0.78 + 0.22 * _easeOutCubic((u - 0.4) / 0.6);
      return RoninPose(squash: squash, happy: true, t: t);
    }
    if (p < 0.28) {
      final blink = (p > 0.2 && p < 0.215) ? 1.0 : 0.0;
      return RoninPose(blink: blink, happy: p > 0.22, t: t);
    }
    if (p < 0.62) {
      // Which slash is active and how far through it.
      final slash = _slashes.lastWhere((s) => p >= s.start, orElse: () => _slashes.first);
      final local = _phase(p, slash.start, slash.end);
      final windup = -1.9; // raised overhead
      final follow = 0.9; // swung down-forward
      final reverse = _slashes.indexOf(slash).isOdd;
      double arm;
      if (local < 0.25) {
        arm = (reverse ? follow : -0.3) + ((reverse ? -1.2 : windup) - (reverse ? follow : -0.3)) * _easeInOut(local / 0.25);
      } else if (local < 0.6) {
        final u = _easeInOut((local - 0.25) / 0.35);
        arm = reverse ? -1.2 + (1.1 + 1.2) * u : windup + (follow - windup) * u;
      } else {
        arm = reverse ? 1.1 : follow;
      }
      return RoninPose(sword: true, arm: arm, t: t, blink: 0);
    }
    if (p < 0.78) {
      final bow = math.sin(_phase(p, 0.66, 0.77) * math.pi);
      return RoninPose(bow: bow, blink: bow > 0.4 ? 1 : 0, happy: true, t: t);
    }
    return RoninPose(run: t * 16, happy: true, t: t);
  }

  void _paintSlash(Canvas canvas, Size size, _Slash slash, double p) {
    final swing = slash.swing(p);
    if (swing <= 0) return;
    final fade = 1 - _phase(p, slash.end - 0.02, slash.end + 0.08);
    if (fade <= 0) return;
    final pts = slash.points(size, 40);
    final head = (swing * pts.length).floor().clamp(1, pts.length - 1);
    final m = math.min(size.width, size.height);
    final base = m * (0.035 + 0.015 * intensity);

    final glow = Paint()
      ..color = roninSlash.withValues(alpha: 0.45 * fade)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10);
    final mid = Paint()
      ..color = roninSlash.withValues(alpha: 0.9 * fade)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    final core = Paint()
      ..color = Color.fromRGBO(255, 255, 255, fade)
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (var i = 1; i <= head; i++) {
      final u = i / pts.length;
      final taper = math.sin(u * math.pi); // thin at both ends: a crescent
      final a = pts[i - 1], b = pts[i];
      canvas
        ..drawLine(a, b, glow..strokeWidth = base * 2.2 * taper + 2)
        ..drawLine(a, b, mid..strokeWidth = base * taper + 1)
        ..drawLine(a, b, core..strokeWidth = base * 0.38 * taper + 0.5);
    }
    // A brief bright line along the chord right as the swing completes.
    final flash = _phase(p, slash.start + (slash.end - slash.start) * 0.6, slash.start + (slash.end - slash.start) * 0.8);
    if (flash > 0 && flash < 1) {
      final s = math.sin(flash * math.pi);
      canvas.drawLine(pts.first, pts.last, _stroke(Color.fromRGBO(255, 255, 255, 0.7 * s), 2 + 2 * s));
    }
  }

  @override
  void dispose() => _bits.clear();
}

/// The departure version used on the sender: pops out of the card at [origin], crouches, and leaps
/// up off the top edge leaving a sparkle trail. [t] is seconds since the departure started.
void paintRoninDeparture(Canvas canvas, Size size, Offset origin, double t) {
  final fh = math.min(size.width * 0.38, size.height * 0.22);
  final pop = _phase(t, 0, 0.2);
  final crouch = _phase(t, 0.2, 0.35);
  final leap = _phase(t, 0.35, 0.65);
  Offset feetAt(double u) {
    final y0 = origin.dy + fh * 0.45;
    final y1 = -fh * 1.3;
    final e = u * u; // accelerates upward
    return Offset(origin.dx + math.sin(u * math.pi) * fh * 0.12, y0 + (y1 - y0) * e);
  }

  // Sparkle trail: positions he already passed through, fading with age.
  if (leap > 0) {
    for (var k = 1; k <= 14; k++) {
      final u = leap - k * 0.035;
      if (u <= 0) break;
      final p = feetAt(u) + Offset(math.sin(k * 2.3) * fh * 0.18, -fh * 0.4 + math.cos(k * 1.7) * fh * 0.15);
      final age = 1 - k / 14;
      final fadeOut = 1 - _phase(t, 0.65, 1.05);
      paintTwinkle(canvas, p, fh * 0.07 * age + 2, k.isEven ? const Color(0xFFFFFFFF) : const Color(0xFFFDE68A),
          age * fadeOut);
    }
  }

  // Flash where he leaves the screen.
  final flash = _phase(t, 0.58, 0.95);
  if (flash > 0 && flash < 1) {
    final s = math.sin(flash * math.pi);
    final at = Offset(feetAt(1).dx, 0);
    canvas.drawCircle(
      at,
      fh * (0.4 + flash * 0.6),
      Paint()
        ..shader = RadialGradient(colors: [
          Color.fromRGBO(255, 255, 255, 0.8 * s),
          roninBand.withValues(alpha: 0.35 * s),
          roninBand.withValues(alpha: 0),
        ]).createShader(Rect.fromCircle(center: at, radius: fh * (0.4 + flash * 0.6))),
    );
  }

  if (leap >= 1) return;
  final scale = pop < 1 ? _easeOutBackSoft(pop) : 1.0;
  final squash = crouch > 0 && leap == 0 ? 1 - 0.18 * math.sin(crouch * math.pi / 2) : (leap > 0 ? 1.15 : 1.0);
  paintRonin(
    canvas,
    feetAt(leap),
    fh * scale,
    RoninPose(happy: true, squash: squash, blink: crouch > 0.3 && leap == 0 ? 1 : 0, t: t),
  );
}

double _easeOutBackSoft(double x) {
  final v = _clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * math.pow(v - 1, 3) + c1 * math.pow(v - 1, 2);
}
