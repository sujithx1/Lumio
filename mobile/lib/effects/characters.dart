// Four original chibi characters, drawn with plain shapes in the same build as Tiny Ronin (ronin.dart):
// feet at the anchor point, a big round head about 55% of the figure, glossy eyes and blush.
//
//  · Boing  — a goggled kid in an orange hoodie with a springy noodle arm and a comic POW.
//  · Kaze   — a fox-eared swordswoman with two crescent-moon blades and a whirl of leaves.
//  · Pebble — a little explorer cadet with a grappling hook and a friendly mossy stone giant.
//  · Snooze — a sleepy cat-eared kid in a cloud cloak who wakes with a blue-purple lightning dash.
//
// On the phone each one arrives from the TOP edge (the edge facing the computer) and is its own
// entrance, so none of them gets the generic arrival comet. Each also has a departure (paint*Departure)
// used on the sender by effects/handoff.dart.
import 'dart:math' as math;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';

import 'renderers.dart' show EffectSim;
import 'ronin.dart' show paintTwinkle;

// ------------------------------------------------------------------------------------------ shared

const _skin = Color(0xFFFFD7B5);
const _skinShade = Color(0xFFF2B48C);
const _ink = Color(0xFF1F2937);
const _blush = Color(0xFFFDA4AF);
const _white = Color(0xFFFFFFFF);
const _mouthDark = Color(0xFF7F1D1D);
const _tongue = Color(0xFFFB7185);
const _heartPink = Color(0xFFF472B6);

Paint _fill(Color c) => Paint()..color = c;
Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeCap = StrokeCap.round
  ..strokeJoin = StrokeJoin.round;

double _clamp01(double x) => x.clamp(0.0, 1.0);
double _phase(double p, double a, double b) => _clamp01((p - a) / (b - a));
double _easeOutCubic(double x) => 1 - math.pow(1 - _clamp01(x), 3).toDouble();
double _easeInCubic(double x) => math.pow(_clamp01(x), 3).toDouble();
double _easeInOut(double x) {
  final v = _clamp01(x);
  return v < 0.5 ? 4 * v * v * v : 1 - math.pow(-2 * v + 2, 3) / 2;
}

double _easeOutBack(double x) {
  final v = _clamp01(x);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * math.pow(v - 1, 3) + c1 * math.pow(v - 1, 2);
}

double _elasticOut(double x) {
  final v = _clamp01(x);
  if (v == 0 || v == 1) return v;
  return math.pow(2, -10 * v) * math.sin((v * 10 - 0.75) * (2 * math.pi / 3)) + 1;
}

Offset _polar(double angle, double radius) => Offset(math.cos(angle), math.sin(angle)) * radius;

enum ChibiMouth { smile, happy, grin, open, yawn }

/// Face settings for one frame.
class ChibiLook {
  const ChibiLook({
    this.blink = 0,
    this.mouth = ChibiMouth.smile,
    this.wink = false,
    this.sleepy = 0,
    this.asleep = false,
    this.glow,
  });

  /// 0 open .. 1 closed (closed eyes read as a happy ^ ^).
  final double blink;
  final ChibiMouth mouth;

  /// Closes the eye on the facing side.
  final bool wink;

  /// 0..1 heavy, half-closed lids.
  final double sleepy;

  /// Peaceful closed eyes (a soft ⌣).
  final bool asleep;

  /// Eyes glow in this colour.
  final Color? glow;
}

/// How a figure is placed and posed for one frame.
class ChibiPose {
  const ChibiPose({this.facing = 1, this.run, this.squash = 1, this.look = const ChibiLook(), this.t = 0});

  /// 1 faces right, -1 faces left.
  final double facing;

  /// Run-cycle phase in radians; null when standing.
  final double? run;

  /// Vertical squash (< 1) or stretch (> 1), anchored at the feet.
  final double squash;
  final ChibiLook look;

  /// Seconds, for hair, tails and other idle motion.
  final double t;

  double get scaleX => facing / squash.clamp(0.6, 1.6);

  /// Maps a point in figure space (feet at the origin, up is negative) to the canvas.
  Offset map(Offset feet, Offset local) => feet + Offset(local.dx * scaleX, local.dy * squash);
}

void _head(Canvas canvas, Offset c, double r) {
  canvas
    ..drawCircle(c + Offset(0, r * 0.04), r, _fill(_skinShade))
    ..drawCircle(c, r, _fill(_skin));
}

void _paintFace(Canvas canvas, Offset c, double r, ChibiLook look, {double blush = 0.8}) {
  final face = c + Offset(r * 0.14, r * 0.12);
  for (final side in [-1.0, 1.0]) {
    final eye = face + Offset(side * r * 0.36, 0);
    final closed = look.asleep || look.blink >= 0.85 || (look.wink && side > 0);
    if (closed) {
      if (look.asleep) {
        canvas.drawArc(
          Rect.fromCenter(center: eye + Offset(0, -r * 0.04), width: r * 0.26, height: r * 0.16),
          math.pi * 0.1,
          math.pi * 0.8,
          false,
          _stroke(_ink, r * 0.055),
        );
      } else {
        canvas.drawArc(
          Rect.fromCenter(center: eye + Offset(0, r * 0.05), width: r * 0.26, height: r * 0.2),
          math.pi * 1.1,
          math.pi * 0.8,
          false,
          _stroke(_ink, r * 0.06),
        );
      }
    } else {
      final ew = r * 0.26;
      final full = r * 0.38;
      final eh = full * (1 - look.blink) * (1 - 0.6 * look.sleepy);
      final ec = eye + Offset(0, (full - eh) * 0.35);
      final glow = look.glow;
      if (glow != null) {
        canvas.drawOval(
          Rect.fromCenter(center: ec, width: ew * 2.2, height: eh * 1.8 + r * 0.12),
          Paint()
            ..color = glow.withValues(alpha: 0.5)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
        );
      }
      canvas.drawOval(Rect.fromCenter(center: ec, width: ew, height: eh), _fill(glow ?? _ink));
      if (eh > r * 0.1) {
        canvas
          ..drawCircle(ec + Offset(-ew * 0.18, -eh * 0.2), ew * 0.24, _fill(_white))
          ..drawCircle(ec + Offset(ew * 0.18, eh * 0.2), ew * 0.11, _fill(_white));
      }
      if (look.sleepy > 0.05) {
        canvas.drawLine(
          ec + Offset(-ew * 0.62, -eh * 0.5),
          ec + Offset(ew * 0.62, -eh * 0.5),
          _stroke(_ink, r * 0.05),
        );
      }
    }
    canvas.drawOval(
      Rect.fromCenter(center: face + Offset(side * r * 0.6, r * 0.32), width: r * 0.24, height: r * 0.13),
      _fill(_blush.withValues(alpha: blush)),
    );
  }

  final mouth = face + Offset(0, r * 0.36);
  switch (look.mouth) {
    case ChibiMouth.smile:
      canvas.drawArc(
        Rect.fromCenter(center: mouth, width: r * 0.2, height: r * 0.12),
        0.2,
        math.pi - 0.4,
        false,
        _stroke(_ink, r * 0.045),
      );
    case ChibiMouth.happy:
      final w = r * 0.09;
      canvas.drawPath(
        Path()
          ..moveTo(mouth.dx - w * 2, mouth.dy - w * 0.4)
          ..quadraticBezierTo(mouth.dx - w, mouth.dy + w * 1.4, mouth.dx, mouth.dy - w * 0.2)
          ..quadraticBezierTo(mouth.dx + w, mouth.dy + w * 1.4, mouth.dx + w * 2, mouth.dy - w * 0.4),
        _stroke(_ink, r * 0.045),
      );
    case ChibiMouth.grin:
      final w = r * 0.46, hh = r * 0.26;
      final top = mouth.dy - hh * 0.35;
      final shape = Path()
        ..moveTo(mouth.dx - w / 2, top)
        ..lineTo(mouth.dx + w / 2, top)
        ..quadraticBezierTo(mouth.dx, top + hh * 1.7, mouth.dx - w / 2, top)
        ..close();
      canvas
        ..save()
        ..clipPath(shape)
        ..drawPath(shape, _fill(_mouthDark))
        ..drawOval(Rect.fromCenter(center: Offset(mouth.dx, top + hh * 0.85), width: w * 0.5, height: hh * 0.5),
            _fill(_tongue))
        ..drawRect(Rect.fromLTRB(mouth.dx - w / 2, top, mouth.dx + w / 2, top + hh * 0.34), _fill(_white));
      for (final k in [-1.0, 0.0, 1.0]) {
        canvas.drawLine(Offset(mouth.dx + k * w * 0.17, top), Offset(mouth.dx + k * w * 0.17, top + hh * 0.34),
            _stroke(const Color(0xFFE5E7EB), r * 0.015));
      }
      canvas
        ..restore()
        ..drawPath(shape, _stroke(_ink, r * 0.035));
    case ChibiMouth.open:
      canvas.drawOval(Rect.fromCenter(center: mouth, width: r * 0.13, height: r * 0.16), _fill(_mouthDark));
    case ChibiMouth.yawn:
      canvas
        ..drawOval(Rect.fromCenter(center: mouth + Offset(0, r * 0.03), width: r * 0.24, height: r * 0.3),
            _fill(_mouthDark))
        ..drawOval(Rect.fromCenter(center: mouth + Offset(0, r * 0.12), width: r * 0.14, height: r * 0.09),
            _fill(_tongue));
  }
}

void _paintHeart(Canvas canvas, Offset at, double s, double alpha) {
  final p = Path()
    ..moveTo(at.dx, at.dy + s * 0.35)
    ..cubicTo(at.dx - s * 0.9, at.dy - s * 0.25, at.dx - s * 0.35, at.dy - s * 0.85, at.dx, at.dy - s * 0.3)
    ..cubicTo(at.dx + s * 0.35, at.dy - s * 0.85, at.dx + s * 0.9, at.dy - s * 0.25, at.dx, at.dy + s * 0.35)
    ..close();
  canvas.drawPath(p, _fill(_heartPink.withValues(alpha: _clamp01(alpha))));
}

void _paintLeaf(Canvas canvas, Offset at, double s, double rot, Color color, double alpha) {
  canvas
    ..save()
    ..translate(at.dx, at.dy)
    ..rotate(rot)
    ..drawPath(
      Path()
        ..moveTo(-s, 0)
        ..quadraticBezierTo(0, -s * 0.62, s, 0)
        ..quadraticBezierTo(0, s * 0.62, -s, 0)
        ..close(),
      _fill(color.withValues(alpha: alpha)),
    )
    ..drawLine(Offset(-s * 0.75, 0), Offset(s * 0.75, 0), _stroke(_white.withValues(alpha: 0.35 * alpha), s * 0.09))
    ..restore();
}

void _paintText(
  Canvas canvas,
  String text,
  Offset center,
  double size,
  Color fill, {
  Color? outline,
  double rotation = 0,
  double alpha = 1,
}) {
  if (size < 1 || alpha <= 0) return;
  canvas
    ..save()
    ..translate(center.dx, center.dy)
    ..rotate(rotation);
  TextPainter layout(TextStyle style) =>
      TextPainter(text: TextSpan(text: text, style: style), textDirection: TextDirection.ltr)..layout();
  final base = TextStyle(fontSize: size, fontWeight: FontWeight.w900, height: 1);
  if (outline != null) {
    final tp = layout(
      base.copyWith(
        foreground: Paint()
          ..style = PaintingStyle.stroke
          ..strokeWidth = size * 0.2
          ..strokeJoin = StrokeJoin.round
          ..color = outline.withValues(alpha: alpha),
      ),
    );
    tp
      ..paint(canvas, Offset(-tp.width / 2, -tp.height / 2))
      ..dispose();
  }
  final tp = layout(base.copyWith(color: fill.withValues(alpha: alpha)));
  tp
    ..paint(canvas, Offset(-tp.width / 2, -tp.height / 2))
    ..dispose();
  canvas.restore();
}

/// A soft burst of light on the top edge where a character leaves the screen.
void _edgeFlash(Canvas canvas, Offset at, double radius, Color color, double s) {
  if (s <= 0 || radius <= 0) return;
  canvas.drawCircle(
    at,
    radius,
    Paint()
      ..shader = RadialGradient(colors: [
        _white.withValues(alpha: 0.85 * s),
        color.withValues(alpha: 0.4 * s),
        color.withValues(alpha: 0),
      ]).createShader(Rect.fromCircle(center: at, radius: radius)),
  );
}

/// Vertical speed lines trailing below something that shoots upward (or beside something moving sideways).
void _speedLines(Canvas canvas, Offset at, double length, double spread, Color color, double alpha, {bool vertical = true}) {
  if (alpha <= 0) return;
  for (var k = 0; k < 5; k++) {
    final off = (k - 2) * spread * 0.5;
    final len = length * (0.6 + 0.4 * ((k * 37) % 5) / 4);
    final from = vertical ? at + Offset(off, spread * 0.3) : at + Offset(-spread * 0.3, off);
    final to = vertical ? from + Offset(0, len) : from + Offset(-len, 0);
    canvas.drawLine(from, to, _stroke(color.withValues(alpha: alpha * 0.6), 2.5));
  }
}

// Particle kinds.
const _leaf = 0, _twinkle = 1, _dust = 2, _pebble = 3, _confetti = 4, _spark = 5, _zed = 6, _heart = 7, _orbit = 8;

class _Bit {
  _Bit(
    this.kind,
    this.pos,
    this.vel,
    this.life,
    this.size,
    this.color, {
    this.spin = 0,
    this.rot = 0,
    this.ang = 0,
    this.rad = 0,
    this.angVel = 0,
    this.radVel = 0,
    this.flat = 1,
    this.text = '',
  }) : maxLife = life;
  final int kind;
  Offset pos;
  Offset vel;
  double life;
  final double maxLife;
  final double size;
  final Color color;
  final double spin;
  double rot;
  // Orbiting bits circle `_CharacterSim.orbitCenter`; `vel.dy` drifts them vertically.
  double ang;
  double rad;
  final double angVel;
  final double radVel;
  final double flat;
  double lift = 0;
  final String text;

  double get alpha => _clamp01(life / maxLife * 1.5);
}

abstract class _CharacterSim extends EffectSim {
  _CharacterSim(this.intensity, this.haptics, int seed) : rng = math.Random(seed);
  final double intensity;
  final bool haptics;
  final math.Random rng;
  final bits = <_Bit>[];
  final _fired = <String>{};
  Size size = Size.zero;

  /// Centre that orbiting bits circle around (leaf whirls and tornadoes).
  Offset orbitCenter = Offset.zero;

  /// Pebbles bounce on this line.
  double ground = double.infinity;

  double r(double a, double b) => a + rng.nextDouble() * (b - a);
  double figure(Size s) => math.min(s.width * 0.5, s.height * 0.3);
  double landY(Size s) => s.height * 0.55 + figure(s) * 0.5;

  /// True exactly once: the first time [when] holds for [key].
  bool once(String key, bool when) => when && _fired.add(key);

  /// 0 tick, 1 light, 2 medium, 3 heavy.
  void buzz(int level) {
    if (!haptics) return;
    switch (level) {
      case 0:
        HapticFeedback.selectionClick();
      case 1:
        HapticFeedback.lightImpact();
      case 2:
        HapticFeedback.mediumImpact();
      default:
        HapticFeedback.heavyImpact();
    }
  }

  void puff(Offset at, int n, double spread) {
    for (var i = 0; i < n; i++) {
      final dir = i.isEven ? -1.0 : 1.0;
      bits.add(_Bit(_dust, at + Offset(dir * r(0, spread), -2), Offset(dir * r(40, 140), -r(10, 60)), r(0.4, 0.8),
          r(8, 16), const Color(0xFFE2E8F0)));
    }
  }

  void sparkle(Offset at, int n, double spread, List<Color> colors) {
    for (var i = 0; i < n; i++) {
      bits.add(_Bit(_twinkle, at + Offset(r(-spread, spread), r(-spread, spread)), Offset(r(-40, 40), r(-60, 10)),
          r(0.4, 0.9), r(4, 9), colors[i % colors.length]));
    }
  }

  void heartAt(Offset at, double size) =>
      bits.add(_Bit(_heart, at, Offset.zero, 1.4, size, _heartPink, rot: r(0, 6)));

  void step(double t, double dt) {
    final h = size.height;
    for (final b in bits) {
      b.life -= dt;
      b.rot += b.spin * dt;
      switch (b.kind) {
        case _leaf:
          b.vel = Offset(b.vel.dx * 0.985 + math.sin(t * 2 + b.rot) * 6, math.min(b.vel.dy + 140 * dt, 120));
        case _twinkle:
          b.vel = b.vel * 0.96;
        case _dust:
          b.vel = b.vel * 0.94;
        case _pebble:
          b.vel = Offset(b.vel.dx * 0.995, b.vel.dy + h * 2.2 * dt);
        case _confetti:
          b.vel = Offset(b.vel.dx * 0.98, math.min(b.vel.dy + 520 * dt, 260));
        case _spark:
          b.vel = b.vel * 0.88;
        case _zed:
          b.vel = Offset(math.sin(t * 2 + b.rot) * 18, -42);
        case _heart:
          b.vel = Offset(math.sin(t * 3 + b.rot) * 16, -46);
      }
      if (b.kind == _orbit) {
        b.ang += b.angVel * dt;
        b.rad += b.radVel * dt;
        b.lift += b.vel.dy * dt;
        b.pos = orbitCenter + Offset(math.cos(b.ang) * b.rad, math.sin(b.ang) * b.rad * b.flat + b.lift);
      } else {
        b.pos += b.vel * dt;
      }
      if (b.kind == _pebble && b.pos.dy > ground && b.vel.dy > 0) {
        b.pos = Offset(b.pos.dx, ground);
        b.vel = Offset(b.vel.dx * 0.7, -b.vel.dy * 0.45);
      }
    }
    bits.removeWhere((b) => b.life <= 0 || b.pos.dy > h + 60);
  }

  /// Background bits (behind the character) or, with [front], hearts and z's floating above heads.
  void paintBits(Canvas canvas, {bool front = false}) {
    for (final b in bits) {
      final isFront = b.kind == _heart || b.kind == _zed;
      if (isFront != front) continue;
      final a = b.alpha;
      switch (b.kind) {
        case _leaf:
        case _orbit:
          _paintLeaf(canvas, b.pos, b.size, b.rot + b.ang, b.color, a);
        case _twinkle:
          paintTwinkle(canvas, b.pos, b.size * a, b.color, a);
        case _dust:
          canvas.drawCircle(b.pos, b.size * (1.6 - a * 0.6), _fill(b.color.withValues(alpha: 0.45 * a)));
        case _pebble:
          canvas
            ..save()
            ..translate(b.pos.dx, b.pos.dy)
            ..rotate(b.rot)
            ..drawOval(Rect.fromCenter(center: Offset.zero, width: b.size * 1.3, height: b.size), _fill(b.color))
            ..drawCircle(Offset(-b.size * 0.2, -b.size * 0.15), b.size * 0.18, _fill(_white.withValues(alpha: 0.4)))
            ..restore();
        case _confetti:
          canvas
            ..save()
            ..translate(b.pos.dx, b.pos.dy)
            ..rotate(b.rot)
            ..drawRect(Rect.fromCenter(center: Offset.zero, width: b.size, height: b.size * 0.5),
                _fill(b.color.withValues(alpha: a)))
            ..restore();
        case _spark:
          canvas.drawLine(b.pos, b.pos - b.vel * 0.04, _stroke(b.color.withValues(alpha: a), 2.2));
        case _zed:
          _paintText(canvas, b.text, b.pos, b.size, b.color, alpha: a);
        case _heart:
          _paintHeart(canvas, b.pos, b.size, a);
      }
    }
  }

  @override
  void dispose() => bits.clear();
}

// ------------------------------------------------------------------------------------------ Boing

const _hoodie = Color(0xFFF97316);
const _hoodieDark = Color(0xFFC2410C);
const _hoodieLight = Color(0xFFFDBA74);
const _shorts = Color(0xFF14B8A6);
const _shortsDark = Color(0xFF0F766E);
const _boingHair = Color(0xFF92400E);
const _strap = Color(0xFF334155);
const _lens = Color(0xFF7DD3FC);
const _rim = Color(0xFFCBD5E1);
const _glove = Color(0xFFFACC15);
const _gloveDark = Color(0xFFCA8A04);
const _sole = Color(0xFFE2E8F0);
const _powOutline = Color(0xFF7C2D12);
const _boingConfetti = [_hoodie, _glove, _shorts, _heartPink, _white];

void _noodle(Canvas canvas, Offset a, Offset b, double width, double wobble, double t) {
  final d = b - a;
  final len = d.distance;
  if (len < 1) return;
  final n = Offset(-d.dy, d.dx) / len;
  final path = Path()..moveTo(a.dx, a.dy);
  for (var i = 1; i <= 28; i++) {
    final u = i / 28;
    final off = math.sin(u * math.pi * 3 + t * 28) * wobble * math.min(len * 0.07, width * 1.8) * math.sin(u * math.pi);
    final p = a + d * u + n * off;
    path.lineTo(p.dx, p.dy);
  }
  canvas
    ..drawPath(path, _stroke(_hoodieDark, width * 1.25))
    ..drawPath(path, _stroke(_hoodie, width));
}

void _gloveAt(Canvas canvas, Offset hand, Offset from, double size) {
  final d = hand - from;
  final dir = d.distance < 0.001 ? const Offset(0, 1) : d / d.distance;
  canvas
    ..drawCircle(hand - dir * size * 0.85, size * 0.62, _fill(_white))
    ..drawCircle(hand - dir * size * 0.85, size * 0.62, _stroke(_sole, size * 0.12))
    ..drawCircle(hand, size, _fill(_glove))
    ..drawCircle(hand, size, _stroke(_gloveDark, size * 0.14))
    ..drawCircle(hand + Offset(-size * 0.3, -size * 0.3), size * 0.25, _fill(_white.withValues(alpha: 0.55)));
}

/// Draws Boing with his feet at [feet], [h] pixels tall. [reach] stretches his front arm to that canvas
/// point; [coil] (0..1) winds it into a spring. Returns where his front glove is.
Offset paintBoing(Canvas canvas, Offset feet, double h, ChibiPose pose, {Offset? reach, double coil = 0, double wobble = 0}) {
  if (h < 2) return feet;
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.scaleX, pose.squash);
  final legSwing = pose.run == null ? 0.0 : math.sin(pose.run!) * 0.6;

  // Legs and sneakers.
  for (final side in [-1.0, 1.0]) {
    canvas
      ..save()
      ..translate(side * 0.06 * h, -0.24 * h)
      ..rotate(legSwing * side)
      ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.035 * h, 0, 0.07 * h, 0.2 * h), Radius.circular(0.03 * h)),
          _fill(_skin));
    final shoe = Rect.fromCenter(center: Offset(0.025 * h, 0.215 * h), width: 0.17 * h, height: 0.085 * h);
    canvas
      ..drawRRect(RRect.fromRectAndRadius(shoe, Radius.circular(0.042 * h)), _fill(_white))
      ..drawRRect(
          RRect.fromRectAndRadius(Rect.fromLTRB(shoe.left, shoe.bottom - 0.024 * h, shoe.right, shoe.bottom),
              Radius.circular(0.012 * h)),
          _fill(_sole));
    for (var k = 0; k < 3; k++) {
      canvas.drawLine(Offset(-0.01 * h + k * 0.028 * h, 0.19 * h), Offset(0.008 * h + k * 0.028 * h, 0.2 * h),
          _stroke(_hoodie, 0.013 * h));
    }
    canvas.restore();
  }

  // Shorts.
  canvas
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(-0.15 * h, -0.34 * h, 0.15 * h, -0.215 * h), Radius.circular(0.04 * h)),
        _fill(_shorts))
    ..drawLine(Offset(0, -0.27 * h), Offset(0, -0.215 * h), _stroke(_shortsDark, 0.014 * h));

  // Back arm: a short noodle with a glove.
  final backShoulder = Offset(-0.1 * h, -0.45 * h);
  final backHand = backShoulder + Offset(-0.05 * h, 0.13 * h);
  canvas.drawLine(backShoulder, backHand, _stroke(_hoodieDark, 0.075 * h));
  _gloveAt(canvas, backHand, backShoulder, 0.048 * h);

  // Hoodie with the hood down, drawstrings and a pocket.
  canvas
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(0, -0.41 * h), width: 0.34 * h, height: 0.21 * h),
        Radius.circular(0.08 * h)), _fill(_hoodie))
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.1 * h, -0.39 * h, 0.2 * h, 0.075 * h), Radius.circular(0.03 * h)),
        _fill(_hoodieDark.withValues(alpha: 0.45)))
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(-0.14 * h, -0.54 * h, 0.12 * h, -0.47 * h), Radius.circular(0.035 * h)),
        _fill(_hoodieDark))
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(-0.12 * h, -0.535 * h, 0.1 * h, -0.5 * h), Radius.circular(0.02 * h)),
        _fill(_hoodieLight.withValues(alpha: 0.5)));
  for (final x in [-0.035, 0.055]) {
    canvas
      ..drawLine(Offset(x * h, -0.48 * h), Offset((x - 0.008) * h, -0.405 * h), _stroke(_white, 0.012 * h))
      ..drawCircle(Offset((x - 0.008) * h, -0.4 * h), 0.012 * h, _fill(_white));
  }
  canvas.restore();

  // Front arm, drawn in canvas space so it can stretch anywhere. Reaching upward it goes behind the head so it
  // never covers his face.
  final shoulder = pose.map(feet, Offset(0.08 * h, -0.46 * h));
  final upward = coil <= 0 && reach != null && reach.dy < shoulder.dy - h * 0.1;
  late Offset hand;
  void frontArm() {
    if (coil > 0) {
      final dir = Offset(-pose.facing * 0.85, 0.25) / Offset(0.85, 0.25).distance;
      final perp = Offset(-dir.dy, dir.dx);
      final len = 0.34 * h * coil + 0.06 * h;
      final rad = 0.075 * h * coil + 0.01 * h;
      const loops = 4;
      final path = Path()..moveTo(shoulder.dx, shoulder.dy);
      for (var i = 1; i <= 80; i++) {
        final u = i / 80;
        final a = u * loops * 2 * math.pi;
        final p = shoulder + dir * len * u + perp * math.sin(a) * rad + dir * (math.cos(a) - 1) * rad * 0.6;
        path.lineTo(p.dx, p.dy);
      }
      hand = shoulder + dir * len;
      canvas
        ..drawPath(path, _stroke(_hoodieDark, 0.062 * h))
        ..drawPath(path, _stroke(_hoodie, 0.045 * h));
      _gloveAt(canvas, hand + dir * 0.03 * h, shoulder, 0.075 * h);
      return;
    }
    hand = reach ?? shoulder + Offset(pose.facing * 0.07 * h, 0.12 * h);
    _noodle(canvas, shoulder, hand, 0.072 * h, wobble, pose.t);
    _gloveAt(canvas, hand, shoulder, reach == null ? 0.05 * h : 0.075 * h);
  }

  if (upward) frontArm();
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.scaleX, pose.squash);

  // Head, messy hair, goggles on the forehead.
  final c = Offset(0.01 * h, -0.73 * h);
  final r = 0.27 * h;
  // Tufts sticking out every which way, behind the head outline.
  for (final (a, len) in [(-2.75, 1.28), (-2.35, 1.36), (-1.95, 1.4), (-1.55, 1.42), (-1.15, 1.36), (-0.75, 1.3), (-0.4, 1.18)]) {
    final tip = c + _polar(a + math.sin(pose.t * 3 + a) * 0.04, r * len);
    final base1 = c + _polar(a - 0.28, r * 0.8);
    final base2 = c + _polar(a + 0.28, r * 0.8);
    canvas.drawPath(
      Path()
        ..moveTo(base1.dx, base1.dy)
        ..quadraticBezierTo(tip.dx, tip.dy, tip.dx, tip.dy)
        ..quadraticBezierTo(tip.dx, tip.dy, base2.dx, base2.dy)
        ..close(),
      _fill(_boingHair),
    );
  }
  _head(canvas, c, r);
  canvas.drawPath(
    Path()
      ..addArc(Rect.fromCircle(center: c, radius: r * 1.03), math.pi * 1.02, math.pi * 0.96)
      ..close(),
    _fill(_boingHair),
  );
  for (final bx in [-0.55, -0.15, 0.25, 0.6]) {
    canvas.drawPath(
      Path()
        ..moveTo(c.dx + (bx - 0.2) * r, c.dy - r * 0.45)
        ..quadraticBezierTo(c.dx + (bx + 0.02) * r, c.dy - r * 0.28, c.dx + (bx + 0.08) * r, c.dy - r * 0.12)
        ..quadraticBezierTo(c.dx + (bx + 0.12) * r, c.dy - r * 0.32, c.dx + (bx + 0.24) * r, c.dy - r * 0.45)
        ..close(),
      _fill(_boingHair),
    );
  }
  canvas
    ..save()
    ..clipPath(Path()..addOval(Rect.fromCircle(center: c, radius: r * 1.02)))
    ..drawRect(Rect.fromLTRB(c.dx - r * 1.1, c.dy - r * 0.5, c.dx + r * 1.1, c.dy - r * 0.36), _fill(_strap))
    ..restore();
  final lensY = c.dy - r * 0.43;
  canvas.drawLine(Offset(c.dx + r * 0.0, lensY), Offset(c.dx + r * 0.28, lensY), _stroke(_rim, r * 0.07));
  for (final lx in [-0.2, 0.48]) {
    final lc = Offset(c.dx + lx * r, lensY);
    canvas
      ..drawCircle(lc, r * 0.2, _fill(_rim))
      ..drawCircle(
        lc,
        r * 0.15,
        Paint()
          ..shader = const RadialGradient(colors: [Color(0xFFE0F2FE), _lens]).createShader(
            Rect.fromCircle(center: lc + Offset(-r * 0.05, -r * 0.05), radius: r * 0.17),
          ),
      )
      ..drawCircle(lc + Offset(-r * 0.05, -r * 0.05), r * 0.045, _fill(_white));
  }
  _paintFace(canvas, c, r, pose.look);
  canvas.restore();
  if (!upward) frontArm();
  return hand;
}

/// Boing drops in from the top edge hanging from a stretched arm, coils his arm, lands a giant comic
/// POW across the screen, snaps back with a wobble, grabs the side edge and slingshots off.
class BoingSim extends _CharacterSim {
  BoingSim(double intensity, bool haptics) : super(intensity, haptics, 11);

  double _home(Size s) => s.width * 0.3;
  Offset _target(Size s) => Offset(s.width * 0.78, s.height * 0.36);
  Offset _grip(Size s) => Offset(s.width - 4, landY(s) - figure(s) * 0.72);

  Offset _feet(double p) {
    final s = size, fh = figure(s), land = landY(s), home = _home(s);
    final hang = land - fh * 0.14;
    if (p < 0.1) {
      final u = p / 0.1;
      final k = 1 - math.exp(-5 * u) * math.cos(9 * u);
      return Offset(home, -fh * 0.3 + (hang + fh * 0.3) * k);
    }
    if (p < 0.15) {
      final u = (p - 0.1) / 0.05;
      return Offset(home, hang + (land - hang) * u * u);
    }
    if (p < 0.8) return Offset(home - s.width * 0.07 * _easeInOut(_phase(p, 0.66, 0.8)), land);
    final u = _easeInCubic(_phase(p, 0.8, 0.97));
    final x0 = home - s.width * 0.07;
    return Offset(x0 + (s.width + fh * 1.6 - x0) * u, land - math.sin(u * math.pi) * fh * 0.35);
  }

  Offset _shoulder(Offset feet, double squash) => feet + Offset(0.08 * figure(size), -0.46 * figure(size) * squash);

  double _squash(double p) {
    if (p < 0.1) return 1.06;
    if (p >= 0.15 && p < 0.2) return 1 - 0.2 * math.sin(_phase(p, 0.15, 0.2) * math.pi);
    if (p >= 0.8) return 1.12;
    return 1;
  }

  Offset? _reach(double p, Offset shoulder) {
    final s = size, fh = figure(s);
    if (p < 0.1) return Offset(_home(s) + fh * 0.12, -2);
    if (p >= 0.3 && p < 0.5) return Offset.lerp(shoulder, _target(s), _easeOutBack(_phase(p, 0.3, 0.36)))!;
    if (p >= 0.5 && p < 0.62) {
      final u = _phase(p, 0.5, 0.62);
      return shoulder + (_target(s) - shoulder) * (1 - _elasticOut(u));
    }
    if (p >= 0.62 && p < 0.8) return Offset.lerp(shoulder, _grip(s), _easeOutCubic(_phase(p, 0.62, 0.68)))!;
    if (p >= 0.8) {
      final grip = _grip(s);
      return shoulder.dx < grip.dx - fh * 0.25 ? grip : null;
    }
    return null;
  }

  double _wobble(double p) {
    if (p < 0.1) return 0.6;
    if (p >= 0.3 && p < 0.45) return 1 - _phase(p, 0.36, 0.45);
    if (p >= 0.5 && p < 0.62) return 1 - _phase(p, 0.5, 0.62);
    if (p >= 0.62 && p < 0.7) return 0.5 * (1 - _phase(p, 0.62, 0.7));
    return 0.15;
  }

  ChibiLook _look(double p) {
    if (p < 0.1) return const ChibiLook(mouth: ChibiMouth.grin);
    if (p < 0.15) return const ChibiLook(mouth: ChibiMouth.open);
    if (p < 0.2) return const ChibiLook(mouth: ChibiMouth.happy, blink: 1);
    if (p < 0.5) return const ChibiLook(mouth: ChibiMouth.grin);
    if (p < 0.62) return const ChibiLook(mouth: ChibiMouth.happy, blink: 1);
    return const ChibiLook(mouth: ChibiMouth.grin);
  }

  @override
  void update(double t, double dt, double progress, Size size) {
    this.size = size;
    final fh = figure(size);
    final feet = _feet(progress);
    ground = landY(size);
    if (once('land', progress >= 0.15)) {
      buzz(1);
      puff(feet, 12, fh * 0.2);
    }
    if (once('pow', progress >= 0.36)) {
      buzz(3);
      final at = _target(size);
      for (var i = 0; i < (28 + 24 * intensity).round(); i++) {
        final a = r(0, math.pi * 2);
        bits.add(_Bit(_confetti, at, _polar(a, r(160, 420)), r(1.2, 2.2), r(7, 12), _boingConfetti[i % _boingConfetti.length],
            spin: r(-8, 8), rot: r(0, 6)));
      }
      sparkle(at, 10, fh * 0.4, const [_white, _glove]);
    }
    if (once('grab', progress >= 0.68)) buzz(1);
    if (once('fling', progress >= 0.8)) {
      buzz(2);
      puff(feet, 10, fh * 0.25);
    }
    step(t, dt);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    this.size = size;
    final fh = figure(size);
    paintBits(canvas);
    _paintPow(canvas, progress);

    final feet = _feet(progress);
    final squash = _squash(progress);
    if (progress > 0.82) {
      _speedLines(canvas, feet + Offset(-fh * 0.3, -fh * 0.5), fh * 0.6, fh * 0.5, _hoodie,
          1 - _phase(progress, 0.92, 1), vertical: false);
    }
    final shoulder = _shoulder(feet, squash);
    final coil = progress >= 0.15 && progress < 0.3 ? _easeOutCubic(_phase(progress, 0.16, 0.27)) : 0.0;
    paintBoing(
      canvas,
      feet,
      fh,
      ChibiPose(squash: squash, look: _look(progress), t: t),
      reach: coil > 0 ? null : _reach(progress, shoulder),
      coil: coil,
      wobble: _wobble(progress),
    );
    paintBits(canvas, front: true);
  }

  void _paintPow(Canvas canvas, double p) {
    final pop = _phase(p, 0.36, 0.41);
    if (pop <= 0) return;
    final fade = 1 - _phase(p, 0.47, 0.53);
    if (fade <= 0) return;
    final c = _target(size);
    final m = math.min(size.width, size.height);
    final big = m * 0.24 * _easeOutBack(pop);
    if (big <= 1) return;

    for (var k = 0; k < 16; k++) {
      final a = k * math.pi / 8 + 0.1;
      canvas.drawLine(c + _polar(a, big * 1.08), c + _polar(a, big * (1.32 + 0.16 * (k % 2))),
          _stroke(_hoodie.withValues(alpha: fade), m * 0.012));
    }
    Path star(double outer, double inner) {
      final path = Path();
      for (var k = 0; k < 32; k++) {
        final rr = k.isEven ? outer * (1 - (k % 3) * 0.05) : inner;
        final pt = c + _polar(k * math.pi / 16 - math.pi / 2, rr);
        k == 0 ? path.moveTo(pt.dx, pt.dy) : path.lineTo(pt.dx, pt.dy);
      }
      return path..close();
    }

    final outer = star(big, big * 0.68);
    canvas
      ..drawPath(outer, _fill(_hoodie.withValues(alpha: fade)))
      ..drawPath(outer, _stroke(_powOutline.withValues(alpha: fade), m * 0.012))
      ..drawPath(star(big * 0.8, big * 0.55), _fill(_glove.withValues(alpha: fade)));
    _paintText(canvas, 'POW!', c, big * 0.48, _white, outline: _powOutline, rotation: -0.18, alpha: fade);
  }
}

/// Sender departure: Boing pops out of the card, stretches an arm up to the top edge and slingshots off.
void paintBoingDeparture(Canvas canvas, Size size, Offset origin, double t) {
  final fh = math.min(size.width * 0.38, size.height * 0.22);
  final pop = _phase(t, 0, 0.15);
  final scale = pop < 1 ? _easeOutBack(pop) : 1.0;
  final y0 = origin.dy + fh * 0.45;
  final launch = _phase(t, 0.42, 0.66);
  final feet = Offset(origin.dx, y0 + (-fh * 1.5 - y0) * launch * launch);
  final grip = Offset(origin.dx + fh * 0.12, -3);
  final squash = launch > 0 ? 1.18 : (t > 0.32 ? 1 - 0.18 * math.sin(_phase(t, 0.32, 0.42) * math.pi / 2) : 1.0);

  _edgeFlash(canvas, Offset(grip.dx, 0), fh * (0.5 + _phase(t, 0.58, 0.95) * 0.6), _hoodie,
      math.sin(_phase(t, 0.58, 0.95) * math.pi));
  if (launch >= 1) return;
  final h = fh * scale;
  if (launch > 0) _speedLines(canvas, feet + Offset(0, -h * 0.2), h * 0.7, h * 0.5, _hoodie, 1 - launch * 0.5);
  Offset? reach;
  if (t >= 0.15) {
    final shoulder = feet + Offset(0.08 * h, -0.46 * h * squash);
    if (shoulder.dy > grip.dy + h * 0.25) reach = Offset.lerp(shoulder, grip, _easeOutCubic(_phase(t, 0.15, 0.3)))!;
  }
  paintBoing(canvas, feet, h, ChibiPose(squash: squash, look: const ChibiLook(mouth: ChibiMouth.grin), t: t),
      reach: reach, wobble: t < 0.32 ? 0.6 : 0.2);
}

// ------------------------------------------------------------------------------------------ Kaze

const _foxOrange = Color(0xFFFB923C);
const _foxCream = Color(0xFFFFF7ED);
const _earPink = Color(0xFFFECDD3);
const _lavender = Color(0xFFC4B5FD);
const _lavenderDark = Color(0xFFA78BFA);
const _kimono = Color(0xFFFAF5FF);
const _violet = Color(0xFF8B5CF6);
const _violetGlow = Color(0xFFA855F7);
const _obi = Color(0xFF14B8A6);
const _obiDark = Color(0xFF0F766E);
const _leggings = Color(0xFF1E1B4B);
const _kazeShoe = Color(0xFF312E81);
const _cyan = Color(0xFF22D3EE);
const _steel = Color(0xFFE2E8F0);
const _kazeLeaves = [Color(0xFF86EFAC), Color(0xFF4ADE80), Color(0xFFC4B5FD), Color(0xFF67E8F9)];

/// A small crescent-moon blade at [at], its convex side pointing along [angle].
void _crescentBlade(Canvas canvas, Offset at, double size, double angle) {
  if (size < 1) return;
  canvas
    ..save()
    ..translate(at.dx, at.dy)
    ..rotate(angle);
  final blade = Path.combine(
    PathOperation.difference,
    Path()..addOval(Rect.fromCircle(center: Offset.zero, radius: size)),
    Path()..addOval(Rect.fromCircle(center: Offset(-size * 0.42, 0), radius: size * 0.92)),
  );
  canvas
    ..drawPath(
      blade,
      Paint()
        ..color = _cyan.withValues(alpha: 0.7)
        ..style = PaintingStyle.stroke
        ..strokeWidth = size * 0.3
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 4),
    )
    ..drawPath(blade, _fill(_steel))
    ..drawPath(blade, _stroke(_cyan, size * 0.08))
    ..restore();
}

/// Draws Kaze. [spin] is a horizontal scale (cos of her spin angle) so she can twirl like a top;
/// [tailWag] 0..1 speeds up her tail; [armsOut] 0..1 raises her blades from her sides to outstretched.
void paintKaze(Canvas canvas, Offset feet, double h, ChibiPose pose, {double spin = 1, double tailWag = 0, double armsOut = 0}) {
  if (h < 2) return;
  final sx = spin.abs() < 0.14 ? 0.14 * (spin.isNegative ? -1 : 1) : spin;
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.scaleX * sx, pose.squash);
  final t = pose.t;
  final legSwing = pose.run == null ? 0.0 : math.sin(pose.run!) * 0.6;

  // Fluffy fox tail behind her.
  canvas
    ..save()
    ..translate(-0.09 * h, -0.3 * h)
    ..rotate(math.sin(t * 5) * 0.22 + tailWag * math.sin(t * 22) * 0.35);
  final tail = Path()
    ..moveTo(0, -0.03 * h)
    ..cubicTo(-0.26 * h, -0.04 * h, -0.36 * h, -0.3 * h, -0.22 * h, -0.44 * h)
    ..cubicTo(-0.12 * h, -0.3 * h, -0.04 * h, -0.1 * h, 0, 0.04 * h)
    ..close();
  canvas
    ..drawPath(tail, _fill(_foxOrange))
    ..save()
    ..clipPath(tail)
    ..drawCircle(Offset(-0.25 * h, -0.43 * h), 0.1 * h, _fill(_foxCream))
    ..restore()
    ..restore();

  // Leggings and shoes.
  for (final side in [-1.0, 1.0]) {
    canvas
      ..save()
      ..translate(side * 0.05 * h, -0.25 * h)
      ..rotate(legSwing * side)
      ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.03 * h, 0, 0.06 * h, 0.22 * h), Radius.circular(0.03 * h)),
          _fill(_leggings))
      ..drawOval(Rect.fromCenter(center: Offset(0.02 * h, 0.23 * h), width: 0.12 * h, height: 0.055 * h), _fill(_kazeShoe))
      ..restore();
  }

  // Back arm and blade.
  final out = _clamp01(armsOut);
  void arm(Offset shoulder, double angle, bool front) {
    final dir = Offset(math.cos(angle), math.sin(angle));
    final hand = shoulder + dir * 0.15 * h;
    canvas
      ..drawLine(shoulder, hand, _stroke(front ? _kimono : const Color(0xFFE9D5FF), 0.08 * h))
      ..drawLine(hand - dir * 0.02 * h, hand - dir * 0.005 * h, _stroke(_violet, 0.085 * h))
      ..drawCircle(hand, 0.033 * h, _fill(_skin));
    _crescentBlade(canvas, hand + dir * 0.07 * h, 0.075 * h, angle);
  }

  arm(Offset(-0.1 * h, -0.46 * h), (math.pi / 2 + 0.55) + (math.pi * 0.42) * out, false);

  // Short kimono-style top with a flared hem, teal obi and a violet collar.
  final hem = Path()
    ..moveTo(-0.13 * h, -0.34 * h)
    ..lineTo(0.13 * h, -0.34 * h)
    ..lineTo(0.18 * h, -0.22 * h)
    ..lineTo(-0.18 * h, -0.22 * h)
    ..close();
  canvas
    ..drawPath(hem, _fill(_kimono))
    ..drawLine(Offset(-0.18 * h, -0.225 * h), Offset(0.18 * h, -0.225 * h), _stroke(_violet, 0.02 * h))
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(0, -0.42 * h), width: 0.28 * h, height: 0.18 * h),
        Radius.circular(0.07 * h)), _fill(_kimono))
    ..drawRect(Rect.fromLTRB(-0.145 * h, -0.37 * h, 0.145 * h, -0.315 * h), _fill(_obi))
    ..drawLine(Offset(-0.145 * h, -0.345 * h), Offset(0.145 * h, -0.345 * h), _stroke(_obiDark, 0.008 * h))
    ..drawPath(
      Path()
        ..moveTo(-0.07 * h, -0.51 * h)
        ..lineTo(0.015 * h, -0.4 * h)
        ..lineTo(0.08 * h, -0.51 * h),
      _stroke(_violet, 0.028 * h),
    );

  // Head: ponytail and fox ears behind, then the face and lavender hair.
  final c = Offset(0.01 * h, -0.73 * h);
  final r = 0.27 * h;
  final sway = math.sin(t * 4) * r * 0.25;
  final tie = c + Offset(-r * 0.45, -r * 0.82);
  canvas
    ..drawPath(
      Path()
        ..moveTo(tie.dx + r * 0.12, tie.dy - r * 0.1)
        ..quadraticBezierTo(c.dx - r * 1.7, c.dy - r * 1.1 + sway, c.dx - r * 1.35 + sway * 0.5, c.dy + r * 0.75)
        ..quadraticBezierTo(c.dx - r * 0.95, c.dy - r * 0.2, tie.dx, tie.dy + r * 0.16)
        ..close(),
      _fill(_lavenderDark),
    )
    ..drawCircle(tie, r * 0.13, _fill(_cyan));
  for (final side in [-1.0, 1.0]) {
    canvas
      ..save()
      ..translate(c.dx + side * r * 0.5, c.dy - r * 0.72)
      ..rotate(side * 0.38);
    final ear = Path()
      ..moveTo(-r * 0.26, r * 0.1)
      ..quadraticBezierTo(-r * 0.12, -r * 0.5, 0, -r * 0.62)
      ..quadraticBezierTo(r * 0.12, -r * 0.5, r * 0.26, r * 0.1)
      ..close();
    canvas
      ..drawPath(ear, _fill(_foxOrange))
      ..drawPath(
        Path()
          ..moveTo(-r * 0.13, r * 0.05)
          ..quadraticBezierTo(0, -r * 0.4, r * 0.13, r * 0.05)
          ..close(),
        _fill(_earPink),
      )
      ..save()
      ..clipPath(ear)
      ..drawCircle(Offset(0, -r * 0.62), r * 0.2, _fill(_foxCream))
      ..restore()
      ..restore();
  }
  _head(canvas, c, r);
  canvas.drawPath(
    Path()
      ..addArc(Rect.fromCircle(center: c, radius: r * 1.03), math.pi * 1.02, math.pi * 0.96)
      ..close(),
    _fill(_lavender),
  );
  // Side locks framing the face, and soft bangs.
  for (final side in [-1.0, 1.0]) {
    final top = c + Offset(side * r * 0.82, -r * 0.35);
    canvas.drawPath(
      Path()
        ..moveTo(top.dx - side * r * 0.12, top.dy)
        ..quadraticBezierTo(top.dx + side * r * 0.22, top.dy + r * 0.6, top.dx + side * r * 0.02, top.dy + r * 1.05)
        ..quadraticBezierTo(top.dx - side * r * 0.08, top.dy + r * 0.55, top.dx - side * r * 0.2, top.dy + r * 0.05)
        ..close(),
      _fill(_lavender),
    );
  }
  for (final bx in [-0.55, -0.18, 0.2, 0.55]) {
    canvas.drawOval(Rect.fromCenter(center: c + Offset(bx * r, -r * 0.52), width: r * 0.48, height: r * 0.34), _fill(_lavender));
  }
  _paintFace(canvas, c, r, pose.look);

  // Front arm and blade over the body.
  arm(Offset(0.07 * h, -0.46 * h), (math.pi / 2 - 0.5) - (math.pi * 0.42 + 0.3) * out, true);
  canvas.restore();
}

/// One whirl crescent: an arc around [center] at [radius], from [start] sweeping [sweep] radians.
void _paintCrescentArc(Canvas canvas, Offset center, double radius, double start, double sweep, double thick, double alpha) {
  if (alpha <= 0 || radius <= 0 || thick <= 0) return;
  const n = 16;
  for (var i = 1; i <= n; i++) {
    final u0 = (i - 1) / n, u1 = i / n;
    final a = center + _polar(start + sweep * u0, radius);
    final b = center + _polar(start + sweep * u1, radius);
    final taper = math.sin((u0 + u1) / 2 * math.pi);
    final col = Color.lerp(_violetGlow, _cyan, (u0 + u1) / 2)!;
    canvas
      ..drawLine(
        a,
        b,
        Paint()
          ..color = col.withValues(alpha: 0.45 * alpha)
          ..strokeWidth = thick * 2.2 * taper + 2
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
      )
      ..drawLine(a, b, _stroke(col.withValues(alpha: 0.9 * alpha), thick * taper + 1))
      ..drawLine(a, b, _stroke(_white.withValues(alpha: alpha), thick * 0.35 * taper + 0.5));
  }
}

/// A straight-ish slash drawn from [a] toward [b] up to [drawn] (0..1).
void _paintLineSlash(Canvas canvas, Offset a, Offset b, double drawn, double thick, double alpha) {
  if (drawn <= 0 || alpha <= 0) return;
  const n = 20;
  final mid = (a + b) / 2;
  final d = b - a;
  final normal = Offset(-d.dy, d.dx) / d.distance;
  final ctrl = mid + normal * d.distance * 0.06;
  Offset at(double u) => a * ((1 - u) * (1 - u)) + ctrl * (2 * u * (1 - u)) + b * (u * u);
  for (var i = 1; i <= (n * drawn).ceil(); i++) {
    final u0 = (i - 1) / n, u1 = math.min(i / n, drawn);
    final taper = math.sin((u0 + u1) / 2 * math.pi);
    final col = Color.lerp(_violetGlow, _cyan, (u0 + u1) / 2)!;
    canvas
      ..drawLine(
        at(u0),
        at(u1),
        Paint()
          ..color = col.withValues(alpha: 0.5 * alpha)
          ..strokeWidth = thick * 2.4 * taper + 2
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      )
      ..drawLine(at(u0), at(u1), _stroke(col.withValues(alpha: alpha), thick * taper + 1))
      ..drawLine(at(u0), at(u1), _stroke(_white.withValues(alpha: alpha), thick * 0.35 * taper + 0.5));
  }
}

/// Kaze spins down from the top like a top, winks, whirls a storm of crescent slashes and leaves, ends with
/// a big X slash, wags her tail and whirls off the side as a little leaf tornado.
class KazeSim extends _CharacterSim {
  KazeSim(double intensity, bool haptics) : super(intensity, haptics, 23);

  static const _crescents = 9;
  double _home(Size s) => s.width * 0.46;

  Offset _feet(double p) {
    final s = size, fh = figure(s), land = landY(s);
    if (p < 0.16) return Offset(_home(s), -fh * 0.2 + (land + fh * 0.2) * _easeOutCubic(p / 0.16));
    if (p < 0.82) return Offset(_home(s), land);
    final u = _easeInCubic(_phase(p, 0.82, 0.98));
    return Offset(_home(s) + (s.width * 0.54 + fh * 1.3) * u, land - math.sin(u * math.pi) * fh * 0.2);
  }

  double _spin(double p, double t) {
    if (p < 0.16) return math.cos(t * 22);
    if (p >= 0.3 && p < 0.66) return math.cos(t * 15);
    if (p >= 0.82) return math.cos(t * 24);
    return 1;
  }

  Offset _xCenter(Size s) => Offset(s.width * 0.5, s.height * 0.19);

  @override
  void update(double t, double dt, double progress, Size size) {
    this.size = size;
    final fh = figure(size);
    final feet = _feet(progress);
    orbitCenter = feet + Offset(0, -fh * 0.5);

    if (progress < 0.16 && rng.nextDouble() < 0.7) {
      bits.add(_Bit(_leaf, feet + Offset(r(-fh * 0.35, fh * 0.35), -fh * r(0.6, 1.3)), Offset(r(-40, 40), r(-80, -20)),
          r(0.8, 1.4), r(6, 10), _kazeLeaves[rng.nextInt(_kazeLeaves.length)], spin: r(-5, 5), rot: r(0, 6)));
    }
    if (once('land', progress >= 0.16)) {
      buzz(1);
      puff(feet, 8, fh * 0.2);
    }
    if (once('sparkle', progress >= 0.21)) sparkle(feet + Offset(fh * 0.4, -fh * 1.05), 6, fh * 0.1, const [_white, _cyan]);

    // Whirl: leaves circle her while the crescents spiral out.
    if (progress >= 0.3 && progress < 0.7 && rng.nextDouble() < 0.35 + 0.4 * intensity) {
      bits.add(_Bit(_orbit, orbitCenter, Offset.zero, r(1.0, 1.8), r(6, 10), _kazeLeaves[rng.nextInt(_kazeLeaves.length)],
          ang: r(0, math.pi * 2), rad: fh * r(0.6, 1.1), angVel: r(3.5, 5.5), radVel: fh * r(0.3, 0.9), spin: r(-3, 3)));
    }
    for (var k = 0; k < _crescents; k++) {
      if (once('c$k', progress >= 0.3 + k * 0.034)) buzz(k.isEven ? 2 : 0);
    }
    if (once('x', progress >= 0.665)) {
      buzz(3);
      final c = _xCenter(size);
      sparkle(c, 16, fh * 0.5, const [_white, _cyan, _violetGlow]);
      for (var i = 0; i < 18; i++) {
        bits.add(_Bit(_leaf, c, _polar(r(0, math.pi * 2), r(80, 260)), r(1.4, 2.4), r(6, 10),
            _kazeLeaves[rng.nextInt(_kazeLeaves.length)], spin: r(-5, 5), rot: r(0, 6)));
      }
    }
    if (once('heart', progress >= 0.73)) heartAt(feet + Offset(fh * 0.35, -fh * 1.15), fh * 0.14);
    // Leaving as a leaf tornado: a funnel of leaves rising around her.
    if (progress >= 0.8 && progress < 0.98 && rng.nextDouble() < 0.8) {
      bits.add(_Bit(_orbit, orbitCenter, Offset(0, -fh * r(0.3, 0.8)), r(0.6, 1.0), r(5, 9),
          _kazeLeaves[rng.nextInt(_kazeLeaves.length)],
          ang: r(0, math.pi * 2), rad: fh * r(0.25, 0.5), angVel: r(7, 10), radVel: fh * r(0.2, 0.6), flat: 0.3,
          spin: r(-3, 3))
        ..lift = fh * r(0.1, 0.4));
    }
    step(t, dt);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    this.size = size;
    final fh = figure(size);
    final feet = _feet(progress);
    final center = feet + Offset(0, -fh * 0.5);
    final m = math.max(size.width, size.height);

    for (var k = 0; k < _crescents; k++) {
      final s0 = 0.3 + k * 0.034;
      final u = _phase(progress, s0, s0 + 0.16);
      if (u <= 0 || u >= 1) continue;
      _paintCrescentArc(canvas, center, fh * 0.8 + u * m * 0.5, k * 2.39996 + u * 2.2, 1.4 * (1 - u * 0.3),
          math.min(size.width, size.height) * 0.035 * (1 - u * 0.4), math.pow(1 - u, 0.7).toDouble());
    }

    // The closing X, above her head.
    final xc = _xCenter(size);
    final fadeX = 1 - _phase(progress, 0.7, 0.78);
    final thick = math.min(size.width, size.height) * 0.04;
    _paintLineSlash(canvas, Offset(size.width * 0.06, xc.dy - size.height * 0.14), Offset(size.width * 0.94, xc.dy + size.height * 0.14),
        _phase(progress, 0.62, 0.65), thick, fadeX);
    _paintLineSlash(canvas, Offset(size.width * 0.94, xc.dy - size.height * 0.14), Offset(size.width * 0.06, xc.dy + size.height * 0.14),
        _phase(progress, 0.64, 0.665), thick, fadeX);
    final flash = _phase(progress, 0.665, 0.74);
    if (flash > 0 && flash < 1) _edgeFlash(canvas, xc, fh * (0.6 + flash * 1.2), _violetGlow, math.sin(flash * math.pi));

    paintBits(canvas);

    final wink = progress >= 0.2 && progress < 0.27;
    final happy = progress >= 0.7 && progress < 0.82;
    final squash = progress >= 0.16 && progress < 0.2 ? 1 - 0.18 * math.sin(_phase(progress, 0.16, 0.2) * math.pi) : 1.0;
    paintKaze(
      canvas,
      feet,
      fh,
      ChibiPose(
        squash: squash,
        t: t,
        look: ChibiLook(
          wink: wink,
          blink: happy ? 1 : 0,
          mouth: wink || happy ? ChibiMouth.happy : ChibiMouth.smile,
        ),
      ),
      spin: _spin(progress, t),
      tailWag: (progress >= 0.18 && progress < 0.3) || happy ? 1 : 0,
      armsOut: progress >= 0.3 && progress < 0.7 ? _phase(progress, 0.3, 0.34) * (1 - _phase(progress, 0.66, 0.7)) : 0,
    );

    final pose = _phase(progress, 0.2, 0.29);
    if (pose > 0 && pose < 1) {
      final s = math.sin(pose * math.pi);
      paintTwinkle(canvas, feet + Offset(fh * 0.42, -fh * 1.08), fh * 0.12 * s, const Color(0xFFFDE68A), s);
    }
    paintBits(canvas, front: true);
  }
}

/// Sender departure: Kaze pops out of the card and spins up off the top edge inside a leaf tornado.
void paintKazeDeparture(Canvas canvas, Size size, Offset origin, double t) {
  final fh = math.min(size.width * 0.38, size.height * 0.22);
  final pop = _phase(t, 0, 0.15);
  final scale = pop < 1 ? _easeOutBack(pop) : 1.0;
  final y0 = origin.dy + fh * 0.45;
  final rise = _phase(t, 0.3, 0.66);
  final feet = Offset(origin.dx, y0 + (-fh * 1.6 - y0) * rise * rise);
  final fade = 1 - _phase(t, 0.75, 1.05);

  _edgeFlash(canvas, Offset(origin.dx, 0), fh * (0.5 + _phase(t, 0.58, 0.95) * 0.6), _violetGlow,
      math.sin(_phase(t, 0.58, 0.95) * math.pi));
  final whirl = _clamp01(t * 4) * fade;
  for (var k = 0; k < 16; k++) {
    final a = k * 0.9 + t * (8 + k % 3);
    final rr = fh * (0.3 + (k % 5) * 0.11) * (1 + rise * 0.6);
    final p = feet + Offset(math.cos(a) * rr, math.sin(a) * rr * 0.3 - fh * (0.1 + (k % 7) * 0.13));
    if (p.dy < -20) continue;
    _paintLeaf(canvas, p, fh * 0.05 + 3, a, _kazeLeaves[k % _kazeLeaves.length], whirl);
  }
  if (rise >= 1) return;
  paintKaze(canvas, feet, fh * scale, ChibiPose(look: const ChibiLook(mouth: ChibiMouth.happy, wink: true), t: t),
      spin: t < 0.12 ? 1 : math.cos(t * (10 + 30 * _phase(t, 0.1, 0.4))), armsOut: _phase(t, 0.15, 0.3));
}

// ------------------------------------------------------------------------------------------ Pebble

const _jacket = Color(0xFFEAB308);
const _jacketDark = Color(0xFFA16207);
const _pocket = Color(0xFFCA8A04);
const _pants = Color(0xFF57534E);
const _boot = Color(0xFF78350F);
const _bootSole = Color(0xFF451A03);
const _helmet = Color(0xFFFDE68A);
const _helmetShade = Color(0xFFFCD34D);
const _lampLight = Color(0xFFFEF08A);
const _pebbleHair = Color(0xFF7C2D12);
const _rope = Color(0xFFA16207);
const _hookSteel = Color(0xFF94A3B8);
const _stone = Color(0xFFA8A29E);
const _stoneDark = Color(0xFF78716C);
const _stoneLight = Color(0xFFD6D3D1);
const _moss = Color(0xFF65A30D);
const _mossLight = Color(0xFF84CC16);
const _giantEye = Color(0xFF4ADE80);
const _giantMouth = Color(0xFF44403C);
const _pebbleColors = [_stone, _stoneDark, _stoneLight];

void _paintHook(Canvas canvas, Offset at, double size, double angle) {
  canvas
    ..save()
    ..translate(at.dx, at.dy)
    ..rotate(angle)
    ..drawLine(Offset.zero, Offset(0, -size), _stroke(_hookSteel, size * 0.18));
  for (final side in [-1.0, 0.0, 1.0]) {
    canvas.drawArc(
      Rect.fromCenter(center: Offset(side * size * 0.28, -size * 0.95), width: size * 0.56, height: size * 0.6),
      side >= 0 ? math.pi * 1.0 : math.pi * 1.5,
      side == 0 ? 0.01 : math.pi * 0.5,
      false,
      _stroke(_hookSteel, size * 0.16),
    );
  }
  canvas
    ..drawCircle(Offset(0, -size), size * 0.14, _fill(_hookSteel))
    ..restore();
}

void _paintRope(Canvas canvas, Offset from, Offset to) {
  final mid = (from + to) / 2 + Offset((to - from).distance * 0.04, 0);
  canvas.drawPath(
    Path()
      ..moveTo(from.dx, from.dy)
      ..quadraticBezierTo(mid.dx, mid.dy, to.dx, to.dy),
    _stroke(_rope, 2.6),
  );
}

/// Draws Pebble. Arm angles are radians in figure space (0 = forward, positive = down, negative = up).
/// Returns where the front hand is.
/// Where Pebble's front hand is for [frontArm], so a rope can be drawn behind him first.
Offset pebbleHand(Offset feet, double h, ChibiPose pose, double frontArm) =>
    pose.map(feet, Offset(0.09 * h, -0.45 * h) + Offset(math.cos(frontArm), math.sin(frontArm)) * 0.15 * h);

Offset paintPebble(Canvas canvas, Offset feet, double h, ChibiPose pose,
    {double frontArm = 1.1, double backArm = 1.9, bool hook = true, bool lamp = true}) {
  if (h < 2) return feet;
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.scaleX, pose.squash);
  final legSwing = pose.run == null ? 0.0 : math.sin(pose.run!) * 0.5;

  // Legs and chunky boots.
  for (final side in [-1.0, 1.0]) {
    canvas
      ..save()
      ..translate(side * 0.07 * h, -0.24 * h)
      ..rotate(legSwing * side)
      ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.045 * h, 0, 0.09 * h, 0.16 * h), Radius.circular(0.03 * h)),
          _fill(_pants))
      ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.06 * h, 0.13 * h, 0.15 * h, 0.1 * h), Radius.circular(0.04 * h)),
          _fill(_boot))
      ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(-0.065 * h, 0.205 * h, 0.16 * h, 0.03 * h), Radius.circular(0.015 * h)),
          _fill(_bootSole))
      ..restore();
  }

  void arm(double angle, Offset shoulder, Color sleeve) {
    final dir = Offset(math.cos(angle), math.sin(angle));
    final hand = shoulder + dir * 0.15 * h;
    canvas
      ..drawLine(shoulder, hand, _stroke(sleeve, 0.085 * h))
      ..drawCircle(hand, 0.038 * h, _fill(_skin));
  }

  final frontShoulder = Offset(0.09 * h, -0.45 * h);
  arm(backArm, Offset(-0.11 * h, -0.45 * h), _jacketDark);

  // Explorer jacket with big pockets.
  canvas
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: Offset(0, -0.385 * h), width: 0.38 * h, height: 0.26 * h),
        Radius.circular(0.1 * h)), _fill(_jacket))
    ..drawLine(Offset(0.01 * h, -0.5 * h), Offset(0.01 * h, -0.27 * h), _stroke(_jacketDark, 0.012 * h));
  for (final px in [-0.095, 0.105]) {
    final pr = Rect.fromCenter(center: Offset(px * h, -0.33 * h), width: 0.12 * h, height: 0.09 * h);
    canvas
      ..drawRRect(RRect.fromRectAndRadius(pr, Radius.circular(0.02 * h)), _fill(_pocket))
      ..drawLine(Offset(pr.left, pr.top + 0.025 * h), Offset(pr.right, pr.top + 0.025 * h), _stroke(_jacketDark, 0.01 * h))
      ..drawCircle(Offset(pr.center.dx, pr.top + 0.03 * h), 0.01 * h, _fill(_jacketDark));
  }
  canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(-0.12 * h, -0.53 * h, 0.12 * h, -0.49 * h), Radius.circular(0.02 * h)),
      _fill(_jacketDark));

  // A raised front arm goes behind the head so it never covers his face.
  final raised = math.sin(frontArm) < -0.6;
  if (raised) arm(frontArm, frontShoulder, _jacket);

  // Head: hair tufts under a round explorer helmet with a lamp.
  final c = Offset(0.01 * h, -0.73 * h);
  final r = 0.27 * h;
  _head(canvas, c, r);
  for (final side in [-1.0, 1.0]) {
    canvas.drawOval(Rect.fromCenter(center: c + Offset(side * r * 0.86, -r * 0.18), width: r * 0.34, height: r * 0.4),
        _fill(_pebbleHair));
  }
  final dome = Path()
    ..addArc(Rect.fromCircle(center: c + Offset(0, -r * 0.18), radius: r * 1.06), math.pi, math.pi)
    ..close();
  canvas
    ..drawPath(dome, _fill(_helmet))
    ..save()
    ..clipPath(dome)
    ..drawCircle(c + Offset(r * 0.55, -r * 0.9), r * 0.7, _fill(_white.withValues(alpha: 0.25)))
    ..drawRect(Rect.fromLTRB(c.dx - r * 1.2, c.dy - r * 0.42, c.dx + r * 1.2, c.dy - r * 0.28), _fill(_jacketDark))
    ..restore()
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromCenter(center: c + Offset(0, -r * 0.16), width: r * 2.4, height: r * 0.16),
        Radius.circular(r * 0.08)), _fill(_helmetShade));
  final lampAt = c + Offset(r * 0.42, -r * 0.62);
  if (lamp) {
    canvas.drawCircle(
      lampAt,
      r * 0.6,
      Paint()
        ..shader = RadialGradient(colors: [_lampLight.withValues(alpha: 0.6), _lampLight.withValues(alpha: 0)])
            .createShader(Rect.fromCircle(center: lampAt, radius: r * 0.6)),
    );
  }
  canvas
    ..drawCircle(lampAt, r * 0.2, _fill(_hookSteel))
    ..drawCircle(lampAt, r * 0.14, _fill(_lampLight))
    ..drawCircle(lampAt + Offset(-r * 0.04, -r * 0.04), r * 0.05, _fill(_white));
  _paintFace(canvas, c, r, pose.look, blush: 0.95);

  // Front arm (with the grappling hook) over the jacket.
  if (!raised) arm(frontArm, frontShoulder, _jacket);
  final dir = Offset(math.cos(frontArm), math.sin(frontArm));
  final handLocal = frontShoulder + dir * 0.15 * h;
  if (hook) _paintHook(canvas, handLocal + dir * 0.02 * h, 0.1 * h, math.atan2(dir.dy, dir.dx) + math.pi / 2);
  canvas.restore();
  return pose.map(feet, handLocal);
}

/// The friendly stone giant: a mossy boulder with glowing eyes, a smile and chunky rock hands.
/// [top] is the canvas y of the top of its head; the body runs off the bottom of the screen.
void paintStoneGiant(Canvas canvas, double cx, double top, double gw, double t, {double wave = 0, bool happy = false}) {
  final body = Rect.fromLTWH(cx - gw / 2, top, gw, gw * 1.8);
  final rrect = RRect.fromRectAndRadius(body, Radius.circular(gw * 0.46));

  // Arms and hands first, so the body overlaps their roots.
  final leftHand = Offset(cx - gw * 0.62, top + gw * 0.92);
  final wavePhase = math.sin(t * 7) * gw * 0.08;
  final rightRest = Offset(cx + gw * 0.62, top + gw * 0.92);
  final rightUp = Offset(cx + gw * 0.7 + wavePhase, top + gw * 0.15);
  final rightHand = Offset.lerp(rightRest, rightUp, _easeOutCubic(wave))!;
  for (final (hand, shoulder) in [
    (leftHand, Offset(cx - gw * 0.38, top + gw * 0.75)),
    (rightHand, Offset(cx + gw * 0.38, top + gw * 0.75)),
  ]) {
    canvas.drawLine(shoulder, hand, _stroke(_stoneDark, gw * 0.16));
    canvas
      ..drawCircle(hand, gw * 0.15, _fill(_stone))
      ..drawCircle(hand + Offset(-gw * 0.04, -gw * 0.04), gw * 0.06, _fill(_stoneLight.withValues(alpha: 0.7)));
    for (var k = -1; k <= 1; k++) {
      canvas.drawCircle(hand + Offset(k * gw * 0.08, -gw * 0.12), gw * 0.05, _fill(_stone));
    }
  }

  canvas.drawRRect(
    rrect,
    Paint()
      ..shader = const LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [_stoneLight, _stone, _stoneDark],
        stops: [0, 0.45, 1],
      ).createShader(body),
  );
  canvas
    ..save()
    ..clipRRect(rrect);
  // Speckles and cracks.
  for (final (dx, dy, rr) in [(-0.28, 0.85, 0.07), (0.25, 1.05, 0.09), (-0.1, 1.3, 0.06), (0.32, 0.55, 0.05), (-0.36, 0.42, 0.05)]) {
    canvas.drawOval(Rect.fromCenter(center: Offset(cx + dx * gw, top + dy * gw), width: rr * gw * 1.6, height: rr * gw),
        _fill(_stoneDark.withValues(alpha: 0.5)));
  }
  canvas
    ..drawPath(
      Path()
        ..moveTo(cx - gw * 0.42, top + gw * 0.62)
        ..lineTo(cx - gw * 0.3, top + gw * 0.7)
        ..lineTo(cx - gw * 0.34, top + gw * 0.8),
      _stroke(_stoneDark, gw * 0.015),
    )
    ..drawPath(
      Path()
        ..moveTo(cx + gw * 0.4, top + gw * 0.25)
        ..lineTo(cx + gw * 0.3, top + gw * 0.32)
        ..lineTo(cx + gw * 0.33, top + gw * 0.4),
      _stroke(_stoneDark, gw * 0.015),
    );
  // A mossy cap with tiny flowers.
  for (var k = 0; k < 9; k++) {
    final x = cx - gw * 0.42 + k * gw * 0.105;
    final y = top + gw * (0.07 + 0.05 * (k - 4).abs() / 4 + 0.02 * (k % 2));
    canvas.drawCircle(Offset(x, y), gw * (0.1 + 0.02 * (k % 3)), _fill(k.isEven ? _moss : _mossLight));
  }
  canvas.restore();
  for (final (dx, dy, color) in [
    (-0.25, 0.06, _white),
    (-0.05, 0.02, const Color(0xFFF9A8D4)),
    (0.18, 0.05, _white),
    (0.33, 0.12, const Color(0xFFF9A8D4)),
  ]) {
    final fc = Offset(cx + dx * gw, top + dy * gw);
    for (var p = 0; p < 5; p++) {
      canvas.drawCircle(fc + _polar(p * math.pi * 2 / 5, gw * 0.018), gw * 0.014, _fill(color));
    }
    canvas.drawCircle(fc, gw * 0.011, _fill(const Color(0xFFFACC15)));
  }

  // Big gentle glowing eyes and a smile.
  for (final side in [-1.0, 1.0]) {
    final e = Offset(cx + side * gw * 0.17, top + gw * 0.38);
    canvas.drawOval(Rect.fromCenter(center: e, width: gw * 0.17, height: gw * 0.2), _fill(_giantMouth.withValues(alpha: 0.55)));
    if (happy) {
      canvas.drawArc(Rect.fromCenter(center: e + Offset(0, gw * 0.02), width: gw * 0.12, height: gw * 0.09), math.pi * 1.1,
          math.pi * 0.8, false, _stroke(_giantEye, gw * 0.025));
    } else {
      canvas
        ..drawOval(
          Rect.fromCenter(center: e, width: gw * 0.16, height: gw * 0.19),
          Paint()
            ..color = _giantEye.withValues(alpha: 0.55)
            ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 8),
        )
        ..drawOval(Rect.fromCenter(center: e, width: gw * 0.11, height: gw * 0.14), _fill(_giantEye))
        ..drawCircle(e + Offset(-gw * 0.022, -gw * 0.03), gw * 0.022, _fill(_white));
    }
  }
  canvas
    ..drawArc(Rect.fromCenter(center: Offset(cx, top + gw * 0.55), width: gw * 0.24, height: gw * 0.13), 0.2, math.pi - 0.4,
        false, _stroke(_giantMouth, gw * 0.025))
    ..drawOval(Rect.fromCenter(center: Offset(cx - gw * 0.3, top + gw * 0.52), width: gw * 0.1, height: gw * 0.05),
        _fill(_blush.withValues(alpha: 0.35)))
    ..drawOval(Rect.fromCenter(center: Offset(cx + gw * 0.3, top + gw * 0.52), width: gw * 0.1, height: gw * 0.05),
        _fill(_blush.withValues(alpha: 0.35)));
}

/// Pebble lowers down from the top on a grappling rope, slams the ground (glowing cracks), and a friendly
/// stone giant rises from the bottom, stomps, waves, and sinks back while Pebble grapples off the top.
class PebbleSim extends _CharacterSim {
  PebbleSim(double intensity, bool haptics) : super(intensity, haptics, 37);

  double _home(Size s) => s.width * 0.2;
  double _gw(Size s) => math.min(s.width * 0.72, s.height * 0.4);
  double _gx(Size s) => s.width * 0.72;

  double _rise(double p) {
    if (p < 0.28) return 0;
    if (p < 0.82) return _easeOutCubic(_phase(p, 0.28, 0.48));
    return 1 - _easeInCubic(_phase(p, 0.82, 0.98));
  }

  double _lift(double p) {
    if (p >= 0.5 && p < 0.57) return math.sin(_phase(p, 0.5, 0.57) * math.pi / 2);
    if (p >= 0.57 && p < 0.585) return 1 - _phase(p, 0.57, 0.585);
    return 0;
  }

  double _giantTop(double p) {
    final s = size, gw = _gw(s);
    return s.height - gw * 1.5 * _rise(p) - _lift(p) * gw * 0.14 + (1 - _rise(p)) * gw * 0.1;
  }

  Offset _feet(double p) {
    final s = size, fh = figure(s), land = landY(s), home = _home(s);
    if (p < 0.14) {
      final u = _easeOutCubic(p / 0.14);
      return Offset(home + math.sin(p * 40) * fh * 0.03 * (1 - u), -fh * 0.15 + (land + fh * 0.15) * u);
    }
    if (p < 0.86) {
      final hop = _phase(p, 0.59, 0.63);
      return Offset(home, land - (hop > 0 && hop < 1 ? math.sin(hop * math.pi) * fh * 0.12 : 0));
    }
    return Offset(home, land + (-fh * 1.4 - land) * _easeInCubic(_phase(p, 0.86, 0.97)));
  }

  Offset _slamPoint(Size s) => Offset(_home(s) + figure(s) * 0.2, landY(s));

  @override
  void update(double t, double dt, double progress, Size size) {
    this.size = size;
    final fh = figure(size), gw = _gw(size);
    final feet = _feet(progress);
    ground = landY(size);
    if (once('land', progress >= 0.14)) {
      buzz(1);
      puff(feet, 10, fh * 0.2);
    }
    if (once('slam', progress >= 0.215)) {
      buzz(2);
      final at = _slamPoint(size);
      puff(at, 10, fh * 0.15);
      for (var i = 0; i < 8; i++) {
        bits.add(_Bit(_pebble, at, Offset(r(-160, 160), -r(200, 420)), r(1.2, 2), r(5, 9), _pebbleColors[i % 3], spin: r(-6, 6)));
      }
    }
    // Dust and pebbles tumbling off the giant as it rises.
    if (progress >= 0.28 && progress < 0.48 && rng.nextDouble() < 0.7) {
      final x = _gx(size) + r(-gw * 0.5, gw * 0.5);
      bits.add(_Bit(_dust, Offset(x, size.height - 4), Offset(r(-30, 30), -r(30, 90)), r(0.6, 1.1), r(10, 18),
          const Color(0xFFD6D3D1)));
    }
    if (once('rumble', progress >= 0.3)) buzz(2);
    if (once('stomp', progress >= 0.585)) {
      buzz(3);
      for (var i = 0; i < (14 + 14 * intensity).round(); i++) {
        bits.add(_Bit(_pebble, Offset(_gx(size) + r(-gw * 0.6, gw * 0.4), ground - 2), Offset(r(-220, 220), -r(260, 620)),
            r(1.5, 2.4), r(5, 11), _pebbleColors[i % 3], spin: r(-8, 8)));
      }
      puff(Offset(_gx(size) - gw * 0.3, ground), 12, gw * 0.4);
    }
    if (once('wave1', progress >= 0.68)) heartAt(Offset(_gx(size) - gw * 0.1, _giantTop(progress) - gw * 0.05), fh * 0.16);
    if (once('wave2', progress >= 0.72)) heartAt(feet + Offset(fh * 0.25, -fh * 1.15), fh * 0.13);
    if (once('hook', progress >= 0.8)) buzz(1);
    step(t, dt);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    this.size = size;
    final fh = figure(size), gw = _gw(size);
    final rise = _rise(progress);
    final stomp = 1 - _phase(progress, 0.585, 0.64);
    final rumble = progress >= 0.28 && progress < 0.48 ? 3 * (1 - rise) : 0.0;
    final shakeAmp = rumble + (progress >= 0.585 ? 9 * stomp : 0);
    canvas
      ..save()
      ..translate(math.sin(t * 90) * shakeAmp, math.cos(t * 77) * shakeAmp * 0.6);

    // Glowing cracks from where Pebble's fist hit the ground.
    final grow = _phase(progress, 0.215, 0.3);
    final crackFade = 1 - _phase(progress, 0.45, 0.6);
    if (grow > 0 && crackFade > 0) {
      final at = _slamPoint(size);
      final rnd = math.Random(5);
      for (final dir in [0.05, math.pi - 0.05, 0.5, math.pi - 0.5, math.pi / 2]) {
        final path = Path()..moveTo(at.dx, at.dy);
        var p = at;
        for (var k = 0; k < 6; k++) {
          final a = dir + (rnd.nextDouble() - 0.5) * 0.8;
          p += _polar(a, fh * 0.2 * grow) * (dir == math.pi / 2 ? 0.4 : 1);
          path.lineTo(p.dx, p.dy);
        }
        canvas
          ..drawPath(
            path,
            Paint()
              ..color = _giantEye.withValues(alpha: 0.6 * crackFade)
              ..style = PaintingStyle.stroke
              ..strokeWidth = 7
              ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6),
          )
          ..drawPath(path, _stroke(const Color(0xFFBBF7D0).withValues(alpha: crackFade), 2.2));
      }
    }

    if (rise > 0) {
      paintStoneGiant(canvas, _gx(size), _giantTop(progress), gw, t,
          wave: progress >= 0.65 && progress < 0.82 ? _phase(progress, 0.65, 0.69) : 0,
          happy: progress >= 0.6 && progress < 0.85);
    }

    // Shockwave rings from the stomp.
    final ring = _phase(progress, 0.585, 0.68);
    if (ring > 0 && ring < 1) {
      for (final lag in [0.0, 0.25]) {
        final u = _clamp01(ring - lag) / (1 - lag);
        if (u <= 0) continue;
        canvas.drawOval(
          Rect.fromCenter(center: Offset(_gx(size), landY(size)), width: gw * (0.6 + u * 2.4), height: gw * (0.15 + u * 0.5)),
          _stroke(_stoneLight.withValues(alpha: 0.7 * (1 - u)), 4 * (1 - u) + 1),
        );
      }
    }

    paintBits(canvas);

    final feet = _feet(progress);
    double frontArm;
    if (progress < 0.14 || progress >= 0.8) {
      frontArm = -math.pi / 2 + 0.35;
    } else if (progress < 0.2) {
      frontArm = -1.2;
    } else if (progress < 0.28) {
      frontArm = -1.2 + 2.5 * _easeOutCubic(_phase(progress, 0.2, 0.215));
    } else if (progress >= 0.65 && progress < 0.8) {
      frontArm = -1.7 + math.sin(t * 12) * 0.4;
    } else {
      frontArm = 1.1;
    }
    final crouch = progress >= 0.15 && progress < 0.23 ? math.sin(_phase(progress, 0.15, 0.23) * math.pi) : 0.0;
    final surprised = progress >= 0.3 && progress < 0.42;
    final happy = progress >= 0.6 && progress < 0.8;
    final pose = ChibiPose(
      squash: 1 - 0.15 * crouch,
      t: t,
      look: ChibiLook(
        mouth: surprised ? ChibiMouth.open : (happy ? ChibiMouth.happy : ChibiMouth.smile),
        blink: happy ? 1 : 0,
      ),
    );

    // The rope (behind him): lowering in from the top edge, and grappling back out of it.
    final hand = pebbleHand(feet, fh, pose, frontArm);
    if (progress < 0.14) {
      final anchor = Offset(hand.dx, -2);
      _paintRope(canvas, hand, anchor);
      _paintHook(canvas, anchor + Offset(0, fh * 0.06), fh * 0.1, math.pi);
    } else if (progress >= 0.8) {
      final fly = _easeOutCubic(_phase(progress, 0.8, 0.85));
      final hookAt = Offset.lerp(hand, Offset(hand.dx, -2), fly)!;
      _paintRope(canvas, hand, hookAt);
      _paintHook(canvas, hookAt + Offset(0, fh * 0.06), fh * 0.1, math.pi);
      if (progress > 0.86) _speedLines(canvas, feet + Offset(0, -fh * 0.1), fh * 0.6, fh * 0.45, _jacket, 1 - _phase(progress, 0.95, 1));
    }
    paintPebble(canvas, feet, fh, pose, frontArm: frontArm, hook: progress >= 0.14 && progress < 0.8);
    paintBits(canvas, front: true);
    canvas.restore();
  }
}

/// Sender departure: Pebble pops out of the card, fires the grappling hook past the top edge and zips off.
void paintPebbleDeparture(Canvas canvas, Size size, Offset origin, double t) {
  final fh = math.min(size.width * 0.38, size.height * 0.22);
  final pop = _phase(t, 0, 0.15);
  final scale = pop < 1 ? _easeOutBack(pop) : 1.0;
  final y0 = origin.dy + fh * 0.45;
  final zip = _phase(t, 0.35, 0.65);
  final feet = Offset(origin.dx, y0 + (-fh * 1.5 - y0) * zip * zip);

  _edgeFlash(canvas, Offset(origin.dx + fh * 0.1, 0), fh * (0.5 + _phase(t, 0.58, 0.95) * 0.6), _giantEye,
      math.sin(_phase(t, 0.58, 0.95) * math.pi));
  if (zip >= 1) return;
  final h = fh * scale;
  if (zip > 0) _speedLines(canvas, feet + Offset(0, -h * 0.1), h * 0.7, h * 0.45, _jacket, 1 - zip * 0.5);
  final firing = t >= 0.15;
  final pose = ChibiPose(look: const ChibiLook(mouth: ChibiMouth.happy), t: t);
  final arm = firing ? -math.pi / 2 + 0.35 : 1.1;
  if (firing) {
    final hand = pebbleHand(feet, h, pose, arm);
    final hookAt = Offset.lerp(hand, Offset(hand.dx, -2), _easeOutCubic(_phase(t, 0.15, 0.3)))!;
    _paintRope(canvas, hand, hookAt);
    _paintHook(canvas, hookAt + Offset(0, fh * 0.06), fh * 0.1, math.pi);
  }
  paintPebble(canvas, feet, h, pose, frontArm: arm, hook: !firing);
}

// ------------------------------------------------------------------------------------------ Snooze

const _catBlack = Color(0xFF111827);
const _silver = Color(0xFFE5E7EB);
const _silverLight = Color(0xFFF8FAFC);
const _silverShade = Color(0xFFCBD5E1);
const _cloak = Color(0xFF1E3A8A);
const _cloakDark = Color(0xFF172554);
const _slipper = Color(0xFF312E81);
const _wood = Color(0xFFB45309);
const _woodDark = Color(0xFF78350F);
const _boltIndigo = Color(0xFF6366F1);
const _boltPale = Color(0xFFA5B4FC);
const _sky = Color(0xFF38BDF8);
const _zColor = Color(0xFFC7D2FE);

void _cloudPuff(Canvas canvas, Offset at, double s, Color color) {
  canvas
    ..drawCircle(at + Offset(-s * 0.9, s * 0.15), s * 0.55, _fill(color))
    ..drawCircle(at + Offset(0, -s * 0.15), s * 0.8, _fill(color))
    ..drawCircle(at + Offset(s * 0.95, s * 0.12), s * 0.6, _fill(color))
    ..drawRRect(RRect.fromRectAndRadius(Rect.fromLTRB(at.dx - s * 1.3, at.dy, at.dx + s * 1.4, at.dy + s * 0.6), Radius.circular(s * 0.3)),
        _fill(color));
}

/// Draws Snooze. [floof] puffs his hair up (1 = calm); [bubble] 0..1 sizes his sleepy nose bubble;
/// [cloud] 0..1 fades in the little cloud he rides.
void paintSnooze(Canvas canvas, Offset feet, double h, ChibiPose pose,
    {double floof = 1, double bubble = 0, double cloud = 0, bool swordReady = false}) {
  if (h < 2) return;
  if (cloud > 0) {
    _cloudPuff(canvas, feet + Offset(0, -h * 0.02), h * 0.22, _white.withValues(alpha: 0.92 * cloud));
    canvas.drawCircle(feet + Offset(-h * 0.1, -h * 0.07), h * 0.06, _fill(_silverLight.withValues(alpha: 0.6 * cloud)));
  }
  canvas
    ..save()
    ..translate(feet.dx, feet.dy)
    ..scale(pose.scaleX, pose.squash);
  final t = pose.t;

  // Slim cat tail.
  final sway = math.sin(t * 3) * 0.06 * h;
  canvas.drawPath(
    Path()
      ..moveTo(-0.12 * h, -0.18 * h)
      ..cubicTo(-0.32 * h, -0.2 * h, -0.36 * h + sway, -0.42 * h, -0.26 * h + sway, -0.5 * h)
      ..quadraticBezierTo(-0.2 * h + sway, -0.55 * h, -0.23 * h + sway, -0.58 * h),
    _stroke(_catBlack, 0.035 * h),
  );

  // Slippers.
  for (final side in [-1.0, 1.0]) {
    canvas.drawOval(Rect.fromCenter(center: Offset(side * 0.07 * h + 0.02 * h, -0.02 * h), width: 0.13 * h, height: 0.06 * h),
        _fill(_slipper));
  }

  // Back arm.
  canvas.drawLine(Offset(-0.1 * h, -0.45 * h), Offset(-0.15 * h, -0.32 * h), _stroke(_cloakDark, 0.07 * h));
  canvas.drawCircle(Offset(-0.15 * h, -0.31 * h), 0.033 * h, _fill(_skin));

  // Cloud-pattern cloak.
  final cloakPath = Path()
    ..moveTo(-0.12 * h, -0.52 * h)
    ..lineTo(0.12 * h, -0.52 * h)
    ..quadraticBezierTo(0.2 * h, -0.28 * h, 0.21 * h, -0.05 * h)
    ..quadraticBezierTo(0, -0.0 * h, -0.21 * h, -0.05 * h)
    ..quadraticBezierTo(-0.2 * h, -0.28 * h, -0.12 * h, -0.52 * h)
    ..close();
  canvas
    ..drawPath(cloakPath, _fill(_cloak))
    ..save()
    ..clipPath(cloakPath)
    ..drawRect(Rect.fromLTRB(-0.25 * h, -0.55 * h, -0.08 * h, 0), _fill(_cloakDark.withValues(alpha: 0.4)));
  for (final (x, y) in [(-0.08, -0.33), (0.09, -0.4), (0.06, -0.15), (-0.12, -0.12), (0.15, -0.26)]) {
    _cloudPuff(canvas, Offset(x * h, y * h), 0.03 * h, _white.withValues(alpha: 0.9));
  }
  canvas
    ..restore()
    ..drawCircle(Offset(0.0, -0.5 * h), 0.022 * h, _fill(_silverLight));

  // Front arm with the wooden practice sword.
  final shoulder = Offset(0.08 * h, -0.46 * h);
  final armAngle = swordReady ? 0.25 : 1.25;
  final dir = Offset(math.cos(armAngle), math.sin(armAngle));
  final hand = shoulder + dir * 0.14 * h;
  final swordAngle = swordReady ? -0.35 : 2.2;
  final sdir = Offset(math.cos(swordAngle), math.sin(swordAngle));
  canvas
    ..drawLine(hand - sdir * 0.06 * h, hand + sdir * 0.32 * h, _stroke(_wood, 0.03 * h))
    ..drawLine(hand - sdir * 0.06 * h, hand + sdir * 0.04 * h, _stroke(_woodDark, 0.036 * h))
    ..drawLine(shoulder, hand, _stroke(_cloak, 0.07 * h))
    ..drawCircle(hand, 0.035 * h, _fill(_skin));

  // Nightcap hood hanging behind, then the head, fluffy silver hair and cat ears.
  final c = Offset(0.01 * h, -0.73 * h);
  final r = 0.27 * h;
  final tip = c + Offset(-r * 1.45 + math.sin(t * 2) * r * 0.08, r * 0.45);
  canvas
    ..drawPath(
      Path()
        ..moveTo(c.dx - r * 0.1, c.dy - r * 0.85)
        ..quadraticBezierTo(c.dx - r * 1.3, c.dy - r * 0.9, tip.dx, tip.dy)
        ..quadraticBezierTo(c.dx - r * 1.0, c.dy + r * 0.1, c.dx - r * 0.85, c.dy + r * 0.35)
        ..close(),
      _fill(_cloakDark),
    )
    ..drawCircle(tip, r * 0.19, _fill(_white))
    ..drawCircle(tip + Offset(r * 0.05, r * 0.05), r * 0.1, _fill(_silverShade));
  _head(canvas, c, r);
  final f = floof.clamp(0.8, 1.6);
  for (var k = 0; k <= 8; k++) {
    final a = math.pi * (1.0 + k / 8);
    final pc = c + _polar(a, r * (0.82 + 0.08 * (f - 1)));
    canvas.drawCircle(pc, r * 0.32 * f, _fill(k.isEven ? _silver : _silverShade));
  }
  for (var k = 0; k <= 8; k += 2) {
    final a = math.pi * (1.0 + k / 8);
    canvas.drawCircle(c + _polar(a, r * 0.86 * f) + Offset(-r * 0.05, -r * 0.08), r * 0.12, _fill(_silverLight));
  }
  for (final bx in [-0.42, -0.05, 0.32, 0.62]) {
    canvas.drawCircle(c + Offset(bx * r, -r * 0.58), r * 0.23 * f, _fill(_silver));
  }
  for (final side in [-1.0, 1.0]) {
    canvas
      ..save()
      ..translate(c.dx + side * r * 0.55, c.dy - r * (0.95 + 0.15 * (f - 1)))
      ..rotate(side * 0.3);
    canvas
      ..drawPath(
        Path()
          ..moveTo(-r * 0.24, r * 0.12)
          ..quadraticBezierTo(-r * 0.1, -r * 0.35, 0, -r * 0.45)
          ..quadraticBezierTo(r * 0.1, -r * 0.35, r * 0.24, r * 0.12)
          ..close(),
        _fill(_catBlack),
      )
      ..drawPath(
        Path()
          ..moveTo(-r * 0.11, r * 0.06)
          ..quadraticBezierTo(0, -r * 0.25, r * 0.11, r * 0.06)
          ..close(),
        _fill(_earPink),
      )
      ..restore();
  }
  _paintFace(canvas, c, r, pose.look);

  if (bubble > 0.02) {
    final bc = c + Offset(r * 0.5, r * 0.28 - r * 0.15 * bubble);
    final br = r * 0.28 * bubble;
    canvas
      ..drawCircle(bc, br, _fill(const Color(0xFFBAE6FD).withValues(alpha: 0.45)))
      ..drawCircle(bc, br, _stroke(_white.withValues(alpha: 0.75), 1.4))
      ..drawCircle(bc + Offset(-br * 0.35, -br * 0.35), br * 0.2, _fill(_white.withValues(alpha: 0.8)));
  }
  canvas.restore();
}

/// A jagged lightning bolt from [a] to [b], drawn up to [drawn] (0..1). [seed] picks its shape.
void _paintBolt(Canvas canvas, Offset a, Offset b, double drawn, double alpha, int seed, double width) {
  if (alpha <= 0 || drawn <= 0) return;
  final d = b - a;
  final len = d.distance;
  if (len < 1) return;
  final rng = math.Random(seed);
  final n = Offset(-d.dy, d.dx) / len;
  const segs = 11;
  final pts = <Offset>[a];
  for (var i = 1; i < segs; i++) {
    pts.add(a + d * (i / segs) + n * ((rng.nextDouble() - 0.5) * len * 0.2));
  }
  pts.add(b);
  final upto = drawn * segs;
  final path = Path()..moveTo(a.dx, a.dy);
  for (var i = 1; i <= segs; i++) {
    if (i - 1 >= upto) break;
    final p = Offset.lerp(pts[i - 1], pts[i], math.min(1.0, upto - (i - 1)))!;
    path.lineTo(p.dx, p.dy);
  }
  final branches = Path();
  for (var k = 0; k < 3; k++) {
    final idx = 2 + rng.nextInt(segs - 4);
    if (idx >= upto) continue;
    final start = pts[idx];
    final turn = (rng.nextBool() ? 1 : -1) * (0.5 + rng.nextDouble() * 0.4);
    final bd = Offset(d.dx * math.cos(turn) - d.dy * math.sin(turn), d.dx * math.sin(turn) + d.dy * math.cos(turn)) / len;
    branches.moveTo(start.dx, start.dy);
    var p = start;
    for (var j = 0; j < 3; j++) {
      p += bd * len * 0.05 + n * ((rng.nextDouble() - 0.5) * len * 0.04);
      branches.lineTo(p.dx, p.dy);
    }
  }
  for (final (path, w) in [(path, width), (branches, width * 0.45)]) {
    canvas
      ..drawPath(
        path,
        Paint()
          ..color = _boltIndigo.withValues(alpha: 0.65 * alpha)
          ..style = PaintingStyle.stroke
          ..strokeWidth = w * 3.2
          ..strokeJoin = StrokeJoin.round
          ..strokeCap = StrokeCap.round
          ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 10),
      )
      ..drawPath(path, _stroke(_boltPale.withValues(alpha: alpha), w))
      ..drawPath(path, _stroke(_white.withValues(alpha: alpha), w * 0.4));
  }
}

/// Snooze floats down from the top asleep on a cloud, yawns (pop goes the bubble), wakes with glowing eyes,
/// zips across the screen as a blue-purple lightning bolt, yawns again and drifts off on his cloud.
class SnoozeSim extends _CharacterSim {
  SnoozeSim(double intensity, bool haptics) : super(intensity, haptics, 53);

  double _home(Size s) => s.width * 0.26;
  double _other(Size s) => s.width * 0.72;
  double _zTimer = 0;

  bool _hidden(double p) => p >= 0.43 && p < 0.465;

  Offset _feet(double p) {
    final s = size, fh = figure(s), land = landY(s);
    if (p < 0.2) {
      final u = _easeOutCubic(p / 0.18);
      return Offset(_home(s) + math.sin(p * 30) * fh * 0.05, -fh * 0.15 + (land - fh * 0.06 + fh * 0.15) * u);
    }
    if (p < 0.26) return Offset(_home(s), land - fh * 0.06 * (1 - _phase(p, 0.2, 0.26)));
    if (p < 0.43) return Offset(_home(s), land);
    if (p < 0.78) return Offset(_other(s), land);
    final drift = _easeInOut(_phase(p, 0.84, 0.99));
    return Offset(_other(s) + (s.width * 0.28 + fh * 1.3) * drift, land - fh * 0.08 * _phase(p, 0.78, 0.84) - math.sin(drift * math.pi) * fh * 0.1);
  }

  Offset _boltFrom(Size s) => Offset(_home(s), landY(s) - figure(s) * 0.45);
  Offset _boltTo(Size s) => Offset(_other(s), landY(s) - figure(s) * 0.45);

  @override
  void update(double t, double dt, double progress, Size size) {
    this.size = size;
    final fh = figure(size);
    final feet = _feet(progress);
    final asleep = progress < 0.3 || progress >= 0.8;

    // z z Z while he sleeps.
    _zTimer -= dt;
    if (asleep && !_hidden(progress) && _zTimer <= 0 && progress < 0.97) {
      _zTimer = 0.38;
      final big = rng.nextDouble() < 0.4;
      bits.add(_Bit(_zed, feet + Offset(fh * 0.3, -fh * 1.05), Offset.zero, 1.4, fh * (big ? 0.14 : 0.09), _zColor,
          rot: r(0, 6), text: big ? 'Z' : 'z'));
    }
    if (once('pop', progress >= 0.235)) {
      buzz(0);
      sparkle(feet + Offset(fh * 0.2, -fh * 0.66), 6, fh * 0.05, const [_white, Color(0xFFBAE6FD)]);
    }
    if (once('wake', progress >= 0.33)) buzz(1);
    // Static sparks around his floofed hair while he's charged.
    if (progress >= 0.33 && progress < 0.62 && !_hidden(progress) && rng.nextDouble() < 0.5) {
      final head = feet + Offset(0, -fh * 0.78);
      final a = r(0, math.pi * 2);
      bits.add(_Bit(_spark, head + _polar(a, fh * 0.3), _polar(a, r(80, 200)), r(0.2, 0.4), 3,
          rng.nextBool() ? _sky : _boltPale));
    }
    if (once('bolt', progress >= 0.44)) {
      buzz(3);
      final to = _boltTo(size);
      for (var i = 0; i < 14; i++) {
        bits.add(_Bit(_spark, to, _polar(r(0, math.pi * 2), r(120, 360)), r(0.25, 0.5), 3, i.isEven ? _sky : _boltPale));
      }
    }
    if (once('arrive', progress >= 0.465)) puff(Offset(_other(size), landY(size)), 8, fh * 0.2);
    step(t, dt);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    this.size = size;
    final fh = figure(size);

    // The bolt and its afterglow.
    final drawn = _phase(progress, 0.43, 0.46);
    final crackle = 1 - _phase(progress, 0.5, 0.6);
    if (drawn > 0 && crackle > 0) {
      _paintBolt(canvas, _boltFrom(size), _boltTo(size), drawn, crackle, (t * 20).floor(),
          math.min(size.width, size.height) * 0.026);
    }
    final flash = _phase(progress, 0.44, 0.5);
    if (flash > 0 && flash < 1) {
      canvas.drawRect(Offset.zero & size, _fill(const Color(0xFFE0E7FF).withValues(alpha: 0.28 * math.sin(flash * math.pi))));
    }
    // A thunder puff where he lands.
    final puffU = _phase(progress, 0.46, 0.58);
    if (puffU > 0 && puffU < 1) {
      final at = _boltTo(size) + Offset(0, -fh * 0.1);
      for (var k = 0; k < 6; k++) {
        canvas.drawCircle(at + _polar(k * 1.05, fh * (0.25 + puffU * 0.35)), fh * (0.14 + puffU * 0.1),
            _fill(_zColor.withValues(alpha: 0.5 * (1 - puffU))));
      }
    }

    paintBits(canvas);

    if (!_hidden(progress)) {
      final feet = _feet(progress);
      final charged = progress >= 0.33 && progress < 0.62;
      final yawn = (progress >= 0.22 && progress < 0.29) || (progress >= 0.66 && progress < 0.72);
      final sleepy = progress < 0.33
          ? 0.7
          : (progress < 0.72 ? 0.0 : 0.8 * _phase(progress, 0.72, 0.78));
      final asleep = progress < 0.22 || progress >= 0.84;
      final floof = charged ? 1 + 0.28 * _easeOutBack(_phase(progress, 0.33, 0.37)) * (1 - _phase(progress, 0.58, 0.64)) : 1.0;
      final bubble = progress < 0.235 ? 0.55 + 0.45 * math.sin(t * 3) : 0.0;
      final cloud = progress < 0.26 ? 1 - _phase(progress, 0.2, 0.26) : (progress >= 0.78 ? _phase(progress, 0.78, 0.83) : 0.0);
      final crouch = progress >= 0.465 && progress < 0.52 ? 1 - 0.15 * (1 - _phase(progress, 0.465, 0.52)) : 1.0;
      paintSnooze(
        canvas,
        feet,
        fh,
        ChibiPose(
          squash: progress >= 0.84 ? 0.9 : crouch,
          t: t,
          look: ChibiLook(
            asleep: asleep,
            sleepy: asleep ? 0 : sleepy,
            mouth: yawn ? ChibiMouth.yawn : (charged ? ChibiMouth.grin : ChibiMouth.smile),
            glow: charged ? _sky : null,
          ),
        ),
        floof: floof,
        bubble: bubble,
        cloud: cloud,
        swordReady: charged,
      );
      // A small pop ring where the bubble burst.
      final pop = _phase(progress, 0.235, 0.27);
      if (pop > 0 && pop < 1) {
        canvas.drawCircle(feet + Offset(fh * 0.15, -fh * 0.66), fh * (0.05 + pop * 0.1),
            _stroke(_white.withValues(alpha: 1 - pop), 1.5));
      }
    }
    paintBits(canvas, front: true);
  }
}

/// Sender departure: Snooze pops out of the card asleep on a cloud, his eyes snap open, and he leaves as a
/// blue-purple lightning zig-zag up off the top edge.
void paintSnoozeDeparture(Canvas canvas, Size size, Offset origin, double t) {
  final fh = math.min(size.width * 0.38, size.height * 0.22);
  final pop = _phase(t, 0, 0.15);
  final scale = pop < 1 ? _easeOutBack(pop) : 1.0;
  final feet = Offset(origin.dx, origin.dy + fh * 0.45);
  final from = feet + Offset(0, -fh * 0.45);
  final to = Offset(origin.dx + fh * 0.15, -8);
  final drawn = _phase(t, 0.3, 0.42);
  final crackle = 1 - _phase(t, 0.5, 0.85);

  _edgeFlash(canvas, Offset(to.dx, 0), fh * (0.5 + _phase(t, 0.4, 0.8) * 0.7), _boltIndigo,
      math.sin(_phase(t, 0.4, 0.8) * math.pi));
  if (drawn > 0) {
    _paintBolt(canvas, from, to, drawn, crackle, (t * 20).floor() + 3, math.min(size.width, size.height) * 0.018);
  }
  if (t >= 0.3) return;
  final awake = t >= 0.15;
  paintSnooze(
    canvas,
    feet,
    fh * scale,
    ChibiPose(
      t: t,
      look: ChibiLook(asleep: !awake, glow: awake ? _sky : null, mouth: awake ? ChibiMouth.grin : ChibiMouth.smile),
    ),
    floof: awake ? 1.25 : 1,
    cloud: 1 - _phase(t, 0.15, 0.25),
    swordReady: awake,
  );
}
