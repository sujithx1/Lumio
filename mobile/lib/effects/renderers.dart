// Mobile effect renderers. Same catalog and visual intent as desktop (desktop/src/effects),
// implemented with Flutter fragment shaders and CustomPainter simulations.
// Effects draw on a transparent canvas over the app; most enter from the left edge (x = 0).
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';

import 'ronin.dart';

/// One running effect. `update` advances the simulation; `paint` draws the current frame.
abstract class EffectSim {
  void update(double t, double dt, double progress, Size size) {}
  void paint(Canvas canvas, Size size, double t, double progress);
  void dispose() {}
}

typedef SimFactory = Future<EffectSim> Function(double intensity, bool haptics);

final _rng = math.Random();
double _rand(double min, double max) => min + _rng.nextDouble() * (max - min);
double _clamp01(double x) => x.clamp(0.0, 1.0);
double _phase(double p, double a, double b) => _clamp01((p - a) / (b - a));
double _easeOutCubic(double x) => 1 - math.pow(1 - _clamp01(x), 3).toDouble();
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

Paint _fill(Color c) => Paint()..color = c;
Paint _stroke(Color c, double w) => Paint()
  ..color = c
  ..style = PaintingStyle.stroke
  ..strokeWidth = w
  ..strokeJoin = StrokeJoin.round
  ..strokeCap = StrokeCap.round;

Path _star(Offset c, double r, {int points = 5, double inner = 0.45, double rot = 0}) {
  final path = Path();
  for (var i = 0; i < points * 2; i++) {
    final rr = i.isEven ? r : r * inner;
    final a = rot + i * math.pi / points - math.pi / 2;
    final p = c + Offset(math.cos(a) * rr, math.sin(a) * rr);
    i == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
  }
  return path..close();
}

/// Renderers available on mobile, keyed by catalog id.
final Map<String, SimFactory> renderers = {
  'cosmic-portal': (i, h) async => PortalSim(i, h),
  'rainbow': (i, _) async => RainbowSim(i),
  'volcano': (i, _) => ShaderSim.load('shaders/volcano.frag', i),
  'lightning': (i, h) async => LightningSim(i, h),
  'celebration': (i, h) async => CelebrationSim(i, h),
  'matrix': (i, _) async => MatrixSim(i),
  'aurora': (i, _) => ShaderSim.load('shaders/aurora.frag', i),
  'fireworks': (i, h) async => FireworksSim(i, h),
  'spiral-orb': (i, h) async => SpiralOrbSim(i, h),
  'pirate-voyage': (i, h) async => PirateVoyageSim(i, h),
  'giants-wall': (i, h) async => GiantsWallSim(i, h),
  'power-aura': (i, h) async => PowerAuraSim(i, h),
  'cartoon-parade': (i, h) async => CartoonParadeSim(i, h),
  'event-horizon': (i, _) => ShaderSim.load('shaders/event_horizon.frag', i),
  'tiny-ronin': (i, h) async => TinyRoninSim(i, h),
};

// ------------------------------------------------------------------------------------------ shaders

const shaderAssets = ['shaders/aurora.frag', 'shaders/volcano.frag', 'shaders/event_horizon.frag'];

/// Loads and draws each shader once off-screen so the GPU pipeline is compiled before an effect
/// arrives. Without this the first use of a shader can stall rendering for a second or more.
Future<void> warmUpShaders() async {
  for (final asset in shaderAssets) {
    try {
      final sim = await ShaderSim.load(asset, 0.5);
      final recorder = ui.PictureRecorder();
      sim.paint(Canvas(recorder), const Size(32, 32), 0, 0.5);
      final picture = recorder.endRecording();
      final image = await picture.toImage(32, 32);
      image.dispose();
      picture.dispose();
      sim.dispose();
    } catch (_) {
      // A device without shader support falls back to the error message in EffectScreen.
    }
  }
}

class ShaderSim extends EffectSim {
  ShaderSim._(this._program, this._intensity) : _shader = _program.fragmentShader();

  static final Map<String, ui.FragmentProgram> _cache = {};

  static Future<ShaderSim> load(String asset, double intensity) async {
    final program = _cache[asset] ??= await ui.FragmentProgram.fromAsset(asset);
    return ShaderSim._(program, intensity);
  }

  // Keeps the program alive for as long as its shader is used.
  // ignore: unused_field
  final ui.FragmentProgram _program;
  final ui.FragmentShader _shader;
  final double _intensity;

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    _shader
      ..setFloat(0, size.width)
      ..setFloat(1, size.height)
      ..setFloat(2, t)
      ..setFloat(3, _intensity)
      ..setFloat(4, progress);
    canvas.drawRect(Offset.zero & size, Paint()..shader = _shader);
  }

  @override
  void dispose() => _shader.dispose();
}

// ------------------------------------------------------------------------------------------ rainbow

/// A soft wash of prismatic light pours in from the edge and drifts across.
class RainbowSim extends EffectSim {
  RainbowSim(this.intensity);
  final double intensity;
  static const _hues = [0.0, 30.0, 55.0, 130.0, 195.0, 235.0, 285.0];

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final w = size.width, h = size.height;
    final fade = 1 - _phase(progress, 0.75, 1);
    final front = _easeOutCubic(t / 2.4) * w * 1.25;
    final band = w * 0.8;
    final alpha = (0.25 + 0.3 * intensity) * fade;
    final colors = <Color>[
      const Color(0x00FFFFFF),
      for (final hue in _hues) HSLColor.fromAHSL(alpha, hue, 0.95, 0.65).toColor(),
      const Color(0x00FFFFFF),
    ];
    final stops = <double>[0, for (var i = 0; i < _hues.length; i++) 0.1 + i / (_hues.length - 1) * 0.8, 1];
    canvas.drawRect(
      Rect.fromLTWH(math.max(0, front - band), 0, band, h),
      Paint()..shader = ui.Gradient.linear(Offset(front - band, 0), Offset(front, 0), colors, stops),
    );
    if (front - band > 0) {
      canvas.drawRect(
        Rect.fromLTWH(0, 0, front - band, h),
        Paint()
          ..shader = ui.Gradient.linear(Offset.zero, Offset(front - band, 0), [
            HSLColor.fromAHSL(alpha * 0.5, 285, 0.9, 0.7).toColor(),
            const Color(0x00FFFFFF),
          ]),
      );
    }
    for (var i = 0; i < 40; i++) {
      final x = (i * 97 % 100) / 100 * w;
      if (x > front) continue;
      final y = ((i * 53 % 100) / 100 * h - t * 20) % h;
      canvas.drawCircle(
        Offset(x, y),
        1.6,
        _fill(Color.fromRGBO(255, 255, 255, (0.35 + 0.35 * math.sin(t * 4 + i)) * fade)),
      );
    }
  }
}

// ------------------------------------------------------------------------------------------ lightning

class _Bolt {
  _Bolt(this.paths, this.born);
  final List<Path> paths;
  final double born;
}

class LightningSim extends EffectSim {
  LightningSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _bolts = <_Bolt>[];
  double _flash = 0;
  double _next = 0.2;

  List<Offset> _path(Offset a, Offset b, double spread, int depth) {
    var pts = [a, b];
    for (var d = 0; d < depth; d++) {
      final next = <Offset>[];
      for (var i = 0; i < pts.length - 1; i++) {
        final dir = pts[i + 1] - pts[i];
        final n = Offset(-dir.dy, dir.dx) / math.max(1, dir.distance);
        next
          ..add(pts[i])
          ..add((pts[i] + pts[i + 1]) / 2 + n * _rand(-spread, spread));
      }
      next.add(pts.last);
      pts = next;
      spread /= 2;
    }
    return pts;
  }

  Path _toPath(List<Offset> pts) {
    final p = Path()..moveTo(pts.first.dx, pts.first.dy);
    for (final o in pts.skip(1)) {
      p.lineTo(o.dx, o.dy);
    }
    return p;
  }

  @override
  void update(double t, double dt, double progress, Size size) {
    final w = size.width, h = size.height;
    if (t >= _next && progress < 0.88) {
      final fromEdge = _rng.nextDouble() < 0.6;
      final a = fromEdge ? Offset(-10, _rand(h * 0.15, h * 0.85)) : Offset(_rand(w * 0.1, w * 0.9), -10);
      final b = fromEdge
          ? Offset(_rand(w * 0.5, w), _rand(h * 0.1, h * 0.9))
          : Offset(a.dx + _rand(-0.15, 0.15) * w, h * _rand(0.6, 1));
      final main = _path(a, b, (b - a).distance * 0.12, 7);
      final paths = [_toPath(main)];
      for (var i = 0; i < 2 + (intensity * 4).floor(); i++) {
        final s = main[(_rand(0.2, 0.7) * main.length).floor()];
        paths.add(_toPath(_path(s, s + Offset(_rand(-0.2, 0.25) * w, _rand(-0.2, 0.2) * h), w * 0.05, 5)));
      }
      _bolts.add(_Bolt(paths, t));
      _flash = math.min(1, _flash + 0.5 + 0.4 * intensity);
      if (haptics) HapticFeedback.heavyImpact();
      _next = t + _rand(0.35, 1.4) / (0.8 + 1.8 * intensity);
    }
    _flash *= math.pow(0.02, dt);
    _bolts.removeWhere((b) => t - b.born > 0.6);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    if (_flash > 0.01) canvas.drawRect(Offset.zero & size, _fill(Color.fromRGBO(200, 215, 255, _flash * 0.3)));
    for (final b in _bolts) {
      final age = t - b.born;
      final flicker = age < 0.08
          ? 1.0
          : age < 0.14
          ? 0.3
          : age < 0.22
          ? 0.9
          : math.max(0.0, 1 - (age - 0.22) / 0.38);
      for (var i = 0; i < b.paths.length; i++) {
        final scale = i == 0 ? 1.0 : 0.55;
        for (final (width, alpha, blur) in [(12.0, 0.25, 14.0), (3.4, 0.95, 4.0), (1.3, 1.0, 0.0)]) {
          canvas.drawPath(
            b.paths[i],
            _stroke(Color.fromRGBO(220, 230, 255, alpha * flicker * (i == 0 ? 1 : 0.7)), width * scale)
              ..blendMode = BlendMode.plus
              ..maskFilter = blur > 0 ? MaskFilter.blur(BlurStyle.normal, blur) : null,
          );
        }
      }
    }
  }
}

// ------------------------------------------------------------------------------------------ celebration

class _Confetto {
  _Confetto(this.pos, this.vel, this.rot, this.vr, this.size, this.color, this.phase);
  Offset pos;
  Offset vel;
  double rot;
  final double vr;
  final Size size;
  final Color color;
  final double phase;
}

const _confettiColors = [
  Color(0xFF7C5CFF),
  Color(0xFF22D3EE),
  Color(0xFF34D399),
  Color(0xFFFBBF24),
  Color(0xFFF472B6),
  Color(0xFFF87171),
  Color(0xFFFFFFFF),
];

class CelebrationSim extends EffectSim {
  CelebrationSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _pieces = <_Confetto>[];
  double _next = 0;

  @override
  void update(double t, double dt, double progress, Size size) {
    if (t >= _next && progress < 0.6) {
      final count = (70 + 100 * intensity).round();
      final y0 = _rand(size.height * 0.35, size.height * 0.75);
      for (var i = 0; i < count; i++) {
        final angle = _rand(-1.15, 0.25);
        final speed = _rand(0.7, 1.6) * size.height * 1.1;
        _pieces.add(
          _Confetto(
            Offset(-10, y0 + _rand(-20, 20)),
            Offset(math.cos(angle), math.sin(angle)) * speed,
            _rand(0, math.pi * 2),
            _rand(-8, 8),
            Size(_rand(6, 11), _rand(3, 6)),
            _confettiColors[_rng.nextInt(_confettiColors.length)],
            _rand(0, math.pi * 2),
          ),
        );
      }
      if (haptics) HapticFeedback.mediumImpact();
      _next = t + 1.1 - 0.4 * intensity;
    }
    final gravity = size.height * 0.9;
    for (final p in _pieces) {
      p.vel = Offset(p.vel.dx * math.pow(0.4, dt), (p.vel.dy + gravity * dt) * math.pow(0.55, dt));
      p.pos += Offset(p.vel.dx + math.sin(t * 3 + p.phase) * 40, p.vel.dy) * dt;
      p.rot += p.vr * dt;
    }
    _pieces.removeWhere((p) => p.pos.dy > size.height + 40);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final paint = Paint();
    for (final p in _pieces) {
      canvas
        ..save()
        ..translate(p.pos.dx, p.pos.dy)
        ..rotate(p.rot)
        ..scale(1, math.cos(t * 6 + p.phase));
      paint.color = p.color;
      canvas
        ..drawRect(Rect.fromCenter(center: Offset.zero, width: p.size.width, height: p.size.height), paint)
        ..restore();
    }
  }
}

// ------------------------------------------------------------------------------------------ matrix

const _glyphs = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';

class MatrixSim extends EffectSim {
  MatrixSim(this.intensity);
  final double intensity;
  static const _cell = 18.0;
  static const _trail = 18;
  final Map<(int, int), TextPainter> _painters = {};
  List<double> _heads = [];
  List<double> _speeds = [];
  List<List<int>> _chars = [];

  TextPainter _glyph(int index, int level) => _painters.putIfAbsent((index, level), () {
    final color = level == 0 ? const Color(0xFFE7FFE9) : Color.fromRGBO(34, 197, 94, 1 - level / (_trail + 2));
    return TextPainter(
      text: TextSpan(
        text: _glyphs[index],
        style: TextStyle(fontSize: _cell * 0.9, color: color, fontFamily: 'monospace', height: 1),
      ),
      textDirection: TextDirection.ltr,
    )..layout();
  });

  @override
  void update(double t, double dt, double progress, Size size) {
    final cols = (size.width / _cell).ceil();
    if (_heads.length != cols) {
      _heads = List.generate(cols, (_) => _rand(-size.height / _cell, 0));
      _speeds = List.generate(cols, (_) => _rand(8, 20) * (0.6 + 0.8 * intensity));
      _chars = List.generate(
        cols,
        (_) => List.generate((size.height / _cell).ceil() + _trail, (_) => _rng.nextInt(_glyphs.length)),
      );
    }
    for (var i = 0; i < cols; i++) {
      _heads[i] += _speeds[i] * dt;
      if (_heads[i] - _trail > size.height / _cell) _heads[i] = _rand(-8, 0);
      if (_rng.nextDouble() < 0.15) {
        final row = _chars[i];
        row[_rng.nextInt(row.length)] = _rng.nextInt(_glyphs.length);
      }
    }
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    for (var i = 0; i < _heads.length; i++) {
      final head = _heads[i].floor();
      for (var k = 0; k < _trail; k++) {
        final row = head - k;
        if (row < 0 || row >= _chars[i].length) continue;
        _glyph(_chars[i][row], k).paint(canvas, Offset(i * _cell, row * _cell));
      }
    }
  }

  @override
  void dispose() {
    for (final p in _painters.values) {
      p.dispose();
    }
  }
}

// ------------------------------------------------------------------------------------------ fireworks

class _Rocket {
  _Rocket(this.x, this.y, this.vy, this.targetY, this.hue);
  final double x;
  double y;
  final double vy;
  final double targetY;
  final double hue;
}

class _Spark {
  _Spark(this.pos, this.vel, this.life, this.hue);
  Offset pos;
  Offset prev = Offset.zero;
  Offset vel;
  double life;
  final double hue;
}

class FireworksSim extends EffectSim {
  FireworksSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _rockets = <_Rocket>[];
  final _sparks = <_Spark>[];
  double _next = 0;

  @override
  void update(double t, double dt, double progress, Size size) {
    if (t >= _next && progress < 0.8) {
      _rockets.add(
        _Rocket(
          _rand(size.width * 0.1, size.width * 0.9),
          size.height + 5,
          -size.height * _rand(0.9, 1.25),
          size.height * _rand(0.15, 0.45),
          _rand(0, 360),
        ),
      );
      _next = t + _rand(0.25, 0.75) / (0.6 + intensity);
    }
    for (final r in _rockets) {
      r.y += r.vy * dt;
    }
    for (final r in _rockets.where((r) => r.y <= r.targetY).toList()) {
      final count = (60 + 70 * intensity).round();
      final speed = math.min(size.width, size.height) * _rand(0.28, 0.45);
      for (var i = 0; i < count; i++) {
        final a = i / count * math.pi * 2 + _rand(-0.05, 0.05);
        final v = speed * _rand(0.55, 1);
        _sparks.add(
          _Spark(Offset(r.x, r.y), Offset(math.cos(a), math.sin(a)) * v, _rand(0.9, 1.6), r.hue + _rand(-18, 18)),
        );
      }
      if (haptics) HapticFeedback.lightImpact();
      _rockets.remove(r);
    }
    final gravity = size.height * 0.35;
    for (final s in _sparks) {
      s.prev = s.pos;
      s.vel = Offset(s.vel.dx * math.pow(0.25, dt), s.vel.dy * math.pow(0.25, dt) + gravity * dt);
      s.pos += s.vel * dt;
      s.life -= dt;
    }
    _sparks.removeWhere((s) => s.life <= 0);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final glow = Paint()
      ..blendMode = BlendMode.plus
      ..strokeCap = StrokeCap.round;
    for (final r in _rockets) {
      glow
        ..color = HSLColor.fromAHSL(0.9, r.hue, 1, 0.8).toColor()
        ..strokeWidth = 3;
      canvas.drawLine(Offset(r.x, r.y), Offset(r.x, r.y + 18), glow);
    }
    for (final s in _sparks) {
      final a = math.min(1.0, s.life);
      glow
        ..color = HSLColor.fromAHSL(a, s.hue % 360, 1, 0.55 + 0.25 * a).toColor()
        ..strokeWidth = 1.5 + 1.5 * a;
      canvas.drawLine(s.prev - (s.pos - s.prev) * 3, s.pos, glow);
    }
  }
}

// ------------------------------------------------------------------------------------------ cosmic portal

const _ringColors = [Color(0xFF5B21B6), Color(0xFF9333EA), Color(0xFFDB2777), Color(0xFFF97316), Color(0xFFFACC15)];
const _ink = Color(0xFF1E1B4B);

class _Flyer {
  _Flyer(this.kind, this.pos, this.vel, this.size, this.hue, this.born, this.vr);
  final int kind; // 0 rocket, 1 planet, 2 star, 3 ufo
  Offset pos;
  final Offset vel;
  final double size;
  final double hue;
  final double born;
  final double vr;
  double rot = 0;
  final trail = <Offset>[];
}

/// A cartoon portal opens at the left edge; rockets, planets, stars and UFOs fly out.
class PortalSim extends EffectSim {
  PortalSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _flyers = <_Flyer>[];
  double _next = 0.5;
  int _order = 0;

  double _radius(double progress, Size size) =>
      math.min(size.width, size.height) *
      0.42 *
      (0.85 + 0.3 * intensity) *
      _easeOutBack(_phase(progress, 0, 0.18)) *
      (1 - _phase(progress, 0.86, 1));

  @override
  void update(double t, double dt, double progress, Size size) {
    final r = _radius(progress, size);
    final m = math.min(size.width, size.height);
    if (t >= _next && progress > 0.12 && progress < 0.78 && r > m * 0.2) {
      const kinds = [0, 1, 2, 3, 1, 2, 0];
      final kind = kinds[_order++ % kinds.length];
      _flyers.add(
        _Flyer(
          kind,
          Offset(r * 0.2, size.height * 0.5 + _rand(-r * 0.25, r * 0.25)),
          Offset(size.width * _rand(0.25, 0.4), size.height * _rand(-0.08, 0.08)),
          m * (kind == 2 ? 0.035 : 0.06) * _rand(0.85, 1.2),
          _rand(0, 360),
          t,
          kind == 2 ? _rand(-3, 3) : _rand(-0.6, 0.6),
        ),
      );
      if (haptics) HapticFeedback.selectionClick();
      _next = t + _rand(0.3, 0.6) / (0.7 + 0.6 * intensity);
    }
    for (final f in _flyers) {
      final age = t - f.born;
      f.pos += Offset(f.vel.dx, f.vel.dy + math.sin(age * 2) * size.height * 0.04) * dt;
      f.rot += f.vr * dt;
      f.trail.add(f.pos);
      if (f.trail.length > 24) f.trail.removeAt(0);
    }
    _flyers.removeWhere((f) => f.pos.dx > size.width + f.size * 4);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final cy = size.height * 0.5;
    final r = _radius(progress, size);
    if (r > 1) {
      final step = r / (_ringColors.length + 2.2);
      for (var i = 0; i < _ringColors.length; i++) {
        final rr = r - i * step;
        canvas
          ..drawCircle(Offset(0, cy), rr, _fill(_ringColors[i]))
          ..drawCircle(Offset(0, cy), rr, _stroke(_ink, 2.5));
        // Rotating highlight segments.
        for (var k = 0; k < 6; k++) {
          final a = k * math.pi / 3 + t * (i.isEven ? 1 : -1);
          canvas.drawArc(
            Rect.fromCircle(center: Offset(0, cy), radius: rr - step * 0.5),
            a,
            0.35,
            false,
            _stroke(const Color(0x59FFFFFF), step * 0.18),
          );
        }
      }
      final ir = r - _ringColors.length * step;
      canvas
        ..drawCircle(Offset(0, cy), ir, _fill(_ink))
        ..drawCircle(Offset(0, cy), ir, _stroke(_ink, 2.5));
      for (var i = 0; i < 24; i++) {
        final a = i * 2.4 + t * 0.8;
        final rr = ((i * 37) % 100) / 100 * ir * 0.9;
        canvas.drawCircle(
          Offset(math.cos(a) * rr, cy + math.sin(a) * rr),
          1.3,
          _fill(Color.fromRGBO(255, 255, 255, 0.5 + 0.5 * math.sin(t * 5 + i))),
        );
      }
    }
    for (final f in _flyers) {
      for (var k = 0; k < f.trail.length; k += 3) {
        canvas.drawCircle(f.trail[k], k / f.trail.length * 2, _fill(const Color(0xB3FFFFFF)));
      }
      final grow = math.min(1.0, 0.25 + f.pos.dx / (r * 1.1 + 1));
      canvas
        ..save()
        ..translate(f.pos.dx, f.pos.dy)
        ..scale(grow, grow);
      _drawFlyer(canvas, f, t);
      canvas.restore();
    }
  }

  void _drawFlyer(Canvas canvas, _Flyer f, double t) {
    final z = f.size;
    final ink = _stroke(_ink, 2);
    switch (f.kind) {
      case 0:
        final fl = z * (0.9 + 0.3 * math.sin(t * 40));
        canvas.drawPath(
          Path()
            ..moveTo(-z * 0.9, -z * 0.28)
            ..quadraticBezierTo(-z * 0.9 - fl, 0, -z * 0.9, z * 0.28),
          _fill(const Color(0xFFFB923C)),
        );
        for (final sgn in [-1.0, 1.0]) {
          final fin = Path()
            ..moveTo(-z * 0.4, sgn * z * 0.32)
            ..lineTo(-z * 0.95, sgn * z * 0.65)
            ..lineTo(-z * 0.85, sgn * z * 0.2)
            ..close();
          canvas
            ..drawPath(fin, _fill(const Color(0xFFEF4444)))
            ..drawPath(fin, ink);
        }
        final body = Path()
          ..moveTo(-z * 0.9, -z * 0.32)
          ..lineTo(z * 0.35, -z * 0.32)
          ..quadraticBezierTo(z * 1.05, 0, z * 0.35, z * 0.32)
          ..lineTo(-z * 0.9, z * 0.32)
          ..close();
        canvas
          ..drawPath(body, _fill(const Color(0xFFF8FAFC)))
          ..drawPath(body, ink);
        final nose = Path()
          ..moveTo(z * 0.45, -z * 0.29)
          ..quadraticBezierTo(z * 1.05, 0, z * 0.45, z * 0.29)
          ..close();
        canvas
          ..drawPath(nose, _fill(const Color(0xFFEF4444)))
          ..drawPath(nose, ink)
          ..drawCircle(Offset(-z * 0.05, 0), z * 0.16, _fill(const Color(0xFF38BDF8)))
          ..drawCircle(Offset(-z * 0.05, 0), z * 0.16, ink);
      case 1:
        canvas
          ..rotate(f.rot)
          ..drawCircle(Offset.zero, z * 0.6, _fill(HSLColor.fromAHSL(1, f.hue, 0.75, 0.62).toColor()))
          ..drawCircle(Offset.zero, z * 0.6, ink)
          ..drawArc(
            Rect.fromCenter(center: Offset.zero, width: z * 2, height: z * 0.56),
            math.pi * 0.05,
            math.pi * 0.9,
            false,
            _stroke(HSLColor.fromAHSL(1, (f.hue + 40) % 360, 0.9, 0.75).toColor(), z * 0.12),
          );
      case 2:
        final s = _star(Offset.zero, z, rot: f.rot);
        canvas
          ..drawPath(s, _fill(const Color(0xFFFDE047)))
          ..drawPath(s, ink);
      default:
        final dome = Rect.fromCenter(center: Offset(0, -z * 0.18), width: z * 0.76, height: z * 0.64);
        final saucer = Rect.fromCenter(center: Offset.zero, width: z * 1.9, height: z * 0.56);
        canvas
          ..drawArc(dome, math.pi, math.pi, true, _fill(const Color(0xFF67E8F9)))
          ..drawArc(dome, math.pi, math.pi, true, ink)
          ..drawOval(saucer, _fill(const Color(0xFF94A3B8)))
          ..drawOval(saucer, ink);
    }
  }
}

// ------------------------------------------------------------------------------------------ spiral orb

/// A spinning orb of wind energy charges at the edge, streaks across and bursts into a spiral shockwave.
class SpiralOrbSim extends EffectSim {
  SpiralOrbSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  bool _burst = false;

  @override
  void update(double t, double dt, double progress, Size size) {
    if (!_burst && progress >= 0.6) {
      _burst = true;
      if (haptics) HapticFeedback.heavyImpact();
    }
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final w = size.width, h = size.height;
    final m = math.min(w, h);
    final r0 = m * 0.14 * (0.8 + 0.4 * intensity);
    final charge = _easeOutCubic(_phase(progress, 0, 0.35));
    final fly = _easeInOut(_phase(progress, 0.35, 0.6));
    final burst = _phase(progress, 0.6, 1);
    final c = Offset(w * (0.18 + 0.4 * fly), h * 0.5);
    final r = r0 * (0.25 + 0.75 * charge) * (1 - _easeOutCubic(burst));
    final add = Paint()..blendMode = BlendMode.plus;

    if (fly > 0 && fly < 1) {
      for (var i = 0; i < 18; i++) {
        final ly = c.dy + _rand(-r0 * 2, r0 * 2);
        canvas.drawLine(
          Offset(c.dx - r0, ly),
          Offset(c.dx - r0 - _rand(0.1, 0.35) * w, ly),
          _stroke(Color.fromRGBO(224, 242, 254, _rand(0.15, 0.5)), _rand(1, 3)),
        );
      }
    }
    if (r > 1) {
      for (var k = 0; k < 3; k++) {
        canvas
          ..save()
          ..translate(c.dx, c.dy)
          ..rotate(t * 5 + k * math.pi / 3)
          ..drawOval(
            Rect.fromCenter(center: Offset.zero, width: r * 3.4, height: r * 0.84),
            _stroke(const Color(0xBFBAE6FD), 2)..blendMode = BlendMode.plus,
          )
          ..restore();
      }
      for (var k = 0; k < 9; k++) {
        final rr = r * (0.35 + k / 9 * 0.65);
        final a = t * (14 - k) + k * 1.3;
        canvas.drawArc(
          Rect.fromCircle(center: c, radius: rr),
          a,
          1.3,
          false,
          _stroke(k.isOdd ? const Color(0xD97DD3FC) : const Color(0xD9FFFFFF), 2.6 - k * 0.15)
            ..blendMode = BlendMode.plus,
        );
      }
      canvas.drawCircle(
        c,
        r * 1.1,
        add
          ..shader = ui.Gradient.radial(
            c,
            r * 1.1,
            [const Color(0xFFFFFFFF), const Color(0xF2BAE6FD), const Color(0x8C38BDF8), const Color(0x000EA5E9)],
            [0, 0.35, 0.7, 1],
          ),
      );
    }
    if (burst > 0) {
      final rr = math.max(w, h) * _easeOutCubic(burst) * 0.9;
      final fade = 1 - burst;
      if (burst < 0.15) {
        canvas.drawRect(Offset.zero & size, _fill(Color.fromRGBO(224, 242, 254, (1 - burst / 0.15) * 0.35)));
      }
      for (var k = 0; k < 3; k++) {
        canvas.drawCircle(
          c,
          math.max(1, rr * (1 - k * 0.12)),
          _stroke(
            Color.fromRGBO(k == 0 ? 255 : 125, k == 0 ? 255 : 211, k == 0 ? 255 : 252, fade * (0.9 - k * 0.25)),
            (10 - k * 3) * fade,
          ),
        );
      }
      for (var k = 0; k < 6; k++) {
        final a0 = k * math.pi / 3 + burst * 6;
        final path = Path();
        for (var j = 0; j <= 24; j++) {
          final d = j / 24 * rr;
          final a = a0 + j / 24 * 2.2;
          final p = c + Offset(math.cos(a) * d, math.sin(a) * d);
          j == 0 ? path.moveTo(p.dx, p.dy) : path.lineTo(p.dx, p.dy);
        }
        canvas.drawPath(path, _stroke(Color.fromRGBO(186, 230, 253, fade * 0.7), 4 * fade));
      }
    }
  }
}

// ------------------------------------------------------------------------------------------ power aura

/// A golden aura powers up from the left edge with crackling lightning and speed lines, then erupts.
class PowerAuraSim extends EffectSim {
  PowerAuraSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _tongues = List.generate(16, (i) => (-1.35 + i / 15 * 2.7, _rand(0, 100), _rand(0.7, 1.2)));
  List<List<Offset>> _arcs = [];
  double _arcTimer = 0;
  bool _erupted = false;

  double _power(double p) =>
      _easeOutCubic(_phase(p, 0, 0.7)) * (1 - math.pow(_phase(p, 0.7, 1), 2)) * (0.75 + 0.5 * intensity);

  @override
  void update(double t, double dt, double progress, Size size) {
    final m = math.min(size.width, size.height);
    final e = Offset(0, size.height * 0.5);
    _arcTimer -= dt;
    final power = _power(progress);
    if (_arcTimer <= 0 && power > 0.2) {
      _arcTimer = _rand(0.05, 0.12);
      final l = m * (0.35 + 0.5 * _easeOutCubic(_phase(progress, 0, 0.7)));
      _arcs = List.generate(2 + (power * 4).floor(), (_) {
        final a = _rand(-1.4, 1.4);
        var p = e + Offset(math.cos(a), math.sin(a)) * l * _rand(0.2, 0.6);
        return [
          for (var k = 0; k < 7; k++)
            () {
              final cur = p;
              p += Offset(_rand(-0.5, 1) * m * 0.05, _rand(-1, 1) * m * 0.05);
              return cur;
            }(),
        ];
      });
    }
    if (!_erupted && progress >= 0.7) {
      _erupted = true;
      if (haptics) HapticFeedback.heavyImpact();
    }
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final w = size.width, h = size.height;
    final m = math.min(w, h);
    final e = Offset(0, h * 0.5);
    final build = _easeOutCubic(_phase(progress, 0, 0.7));
    final erupt = _phase(progress, 0.7, 1);
    final power = _power(progress);
    final l = m * (0.35 + 0.5 * build + 0.7 * _easeOutCubic(erupt) * (1 - erupt));

    if (build > 0.45 && erupt < 0.6) {
      for (var i = 0; i < 30; i++) {
        final a = _rand(-1.5, 1.5);
        final r1 = _rand(0.5, 0.7) * w;
        final r2 = r1 + _rand(0.2, 0.6) * w;
        canvas.drawLine(
          e + Offset(math.cos(a), math.sin(a)) * r1,
          e + Offset(math.cos(a), math.sin(a)) * r2,
          _stroke(Color.fromRGBO(255, 251, 235, _rand(0.08, 0.3) * power), _rand(1, 3)),
        );
      }
    }
    for (final (a0, seed, lenMul) in _tongues) {
      final flick = 0.7 + 0.3 * math.sin(t * 9 + seed) + 0.15 * math.sin(t * 23 + seed * 2);
      final len = l * lenMul * flick;
      final a = a0 + math.sin(t * 3 + seed) * 0.06;
      final tip = e + Offset(math.cos(a) * len, math.sin(a) * len - len * 0.15);
      final n = Offset(-math.sin(a), math.cos(a));
      final baseW = m * 0.08;
      final mid = e + Offset(math.cos(a), math.sin(a)) * len * 0.55;
      final path = Path()
        ..moveTo((e + n * baseW).dx, (e + n * baseW).dy)
        ..quadraticBezierTo((mid + n * baseW * 1.4).dx, (mid + n * baseW * 1.4).dy, tip.dx, tip.dy)
        ..quadraticBezierTo(
          (mid - n * baseW * 1.4).dx,
          (mid - n * baseW * 1.4).dy,
          (e - n * baseW).dx,
          (e - n * baseW).dy,
        )
        ..close();
      canvas.drawPath(
        path,
        Paint()
          ..blendMode = BlendMode.plus
          ..shader = ui.Gradient.linear(
            e,
            tip,
            [
              Color.fromRGBO(255, 255, 255, 0.75 * power),
              Color.fromRGBO(253, 224, 71, 0.55 * power),
              Color.fromRGBO(245, 158, 11, 0.25 * power),
              const Color(0x00F59E0B),
            ],
            [0, 0.3, 0.75, 1],
          ),
      );
    }
    canvas.drawCircle(
      e,
      l * 0.6,
      Paint()
        ..blendMode = BlendMode.plus
        ..shader = ui.Gradient.radial(
          e,
          l * 0.6,
          [
            Color.fromRGBO(255, 255, 255, 0.8 * power),
            Color.fromRGBO(253, 224, 71, 0.35 * power),
            const Color(0x00F59E0B),
          ],
          [0, 0.4, 1],
        ),
    );
    for (final pts in _arcs) {
      final path = Path()..moveTo(pts.first.dx, pts.first.dy);
      for (final p in pts.skip(1)) {
        path.lineTo(p.dx, p.dy);
      }
      canvas.drawPath(
        path,
        _stroke(Color.fromRGBO(224, 242, 254, 0.9 * math.min(1, power)), 2)
          ..maskFilter = const MaskFilter.blur(BlurStyle.solid, 3),
      );
    }
    if (erupt > 0) {
      if (erupt < 0.12) {
        canvas.drawRect(Offset.zero & size, _fill(Color.fromRGBO(255, 251, 235, (1 - erupt / 0.12) * 0.45)));
      }
      canvas.drawArc(
        Rect.fromCircle(center: e, radius: math.max(1, math.max(w, h) * 1.1 * _easeOutCubic(erupt))),
        -math.pi / 2,
        math.pi,
        false,
        _stroke(Color.fromRGBO(253, 224, 71, (1 - erupt) * 0.8), 14 * (1 - erupt)),
      );
    }
  }
}

// ------------------------------------------------------------------------------------------ giant's wall

/// The ground shakes, a stone wall rises, and a giant with glowing eyes peers over it through steam.
class GiantsWallSim extends EffectSim {
  GiantsWallSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _stomps = [0.06, 0.16, 0.3];
  final _played = <double>{};
  double _shake = 0;
  final _steam = <List<double>>[]; // x, y, r, vr, vy, life

  @override
  void update(double t, double dt, double progress, Size size) {
    for (final s in _stomps) {
      if (progress >= s && _played.add(s)) {
        _shake = 1;
        if (haptics) HapticFeedback.heavyImpact();
      }
    }
    _shake *= math.pow(0.02, dt);
    final m = math.min(size.width, size.height);
    final peek = _easeInOut(_phase(progress, 0.3, 0.55)) * (1 - _easeInOut(_phase(progress, 0.82, 0.97)));
    if (peek > 0 && _rng.nextDouble() < 0.5) {
      final headH = m * 0.75;
      _steam.add([
        size.width * 0.5 + _rand(-headH * 0.45, headH * 0.45),
        size.height * 0.62 + _rand(-headH * 0.1, headH * 0.2),
        m * _rand(0.04, 0.08),
        m * _rand(0.05, 0.1),
        -m * _rand(0.06, 0.14),
        1,
      ]);
    }
    for (final s in _steam) {
      s[2] += s[3] * dt;
      s[1] += s[4] * dt;
      s[5] -= dt * 0.45;
    }
    _steam.removeWhere((s) => s[5] <= 0);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    final w = size.width, h = size.height;
    final m = math.min(w, h);
    canvas
      ..save()
      ..translate(_rand(-1, 1) * _shake * 10 * intensity, _rand(-1, 1) * _shake * 8 * intensity);
    final rise = _easeOutCubic(_phase(progress, 0.04, 0.25)) * (1 - _phase(progress, 0.88, 1));
    final wallH = h * 0.2;
    final wallTop = h - wallH * rise;
    final peek = _easeInOut(_phase(progress, 0.3, 0.55)) * (1 - _easeInOut(_phase(progress, 0.82, 0.97)));
    final headH = m * 0.75;
    final headW = headH * 0.78;
    final hx = w * 0.5;
    final hy = wallTop + headH * 0.62 - peek * headH * 0.62;

    if (peek > 0) {
      canvas
        ..drawOval(
          Rect.fromCenter(center: Offset(hx, hy + headH * 0.75), width: headW * 2.8, height: headH * 0.8),
          _fill(const Color(0xFF2A1A12)),
        )
        ..drawOval(
          Rect.fromCenter(center: Offset(hx, hy), width: headW, height: headH),
          Paint()
            ..shader = ui.Gradient.radial(Offset(hx - headW * 0.15, hy - headH * 0.2), headH * 0.6, [
              const Color(0xFF5B3A29),
              const Color(0xFF24150E),
            ]),
        )
        ..drawOval(
          Rect.fromCenter(center: Offset(hx, hy - headH * 0.12), width: headW * 0.84, height: headH * 0.16),
          _fill(const Color(0xFF1A0F0A)),
        );
      final blink = math.sin(t * 0.9).abs() > 0.97 ? 0.15 : 1.0;
      for (final sgn in [-1.0, 1.0]) {
        final eye = Offset(hx + sgn * headW * 0.19, hy - headH * 0.04);
        canvas
          ..drawCircle(
            eye,
            headW * 0.22,
            Paint()
              ..blendMode = BlendMode.plus
              ..shader = ui.Gradient.radial(eye, headW * 0.22, [
                Color.fromRGBO(253, 230, 138, 0.9 * peek),
                const Color(0x00F59E0B),
              ]),
          )
          ..drawOval(
            Rect.fromCenter(center: eye, width: headW * 0.18, height: headW * 0.11 * blink),
            _fill(const Color(0xFFFFF7D6)),
          )
          ..drawCircle(
            eye + Offset(math.sin(t * 0.6) * headW * 0.04, 0),
            headW * 0.03 * blink,
            _fill(const Color(0xFFB45309)),
          );
      }
    }
    if (rise > 0) {
      final bh = wallH / 4;
      for (var row = 0; row < 5; row++) {
        final y = wallTop + row * bh;
        final off = row.isOdd ? bh * 0.9 : 0.0;
        for (var x = -off; x < w; x += bh * 1.8) {
          final shade = 70 + ((x / bh).floor() * 37 + row * 13) % 20;
          canvas.drawRect(
            Rect.fromLTWH(x, y, bh * 1.8 - 3, bh - 3),
            _fill(Color.fromRGBO(shade + 18, shade + 12, shade + 8, 1)),
          );
        }
      }
      canvas.drawRect(Rect.fromLTWH(0, wallTop - 4, w, 6), _fill(const Color(0xFF292524)));
    }
    for (final s in _steam) {
      final c = Offset(s[0], s[1]);
      canvas.drawCircle(
        c,
        s[2],
        Paint()
          ..shader = ui.Gradient.radial(c, s[2], [Color.fromRGBO(245, 245, 244, 0.55 * s[5]), const Color(0x00F5F5F4)]),
      );
    }
    canvas.restore();
  }
}

// ------------------------------------------------------------------------------------------ pirate voyage

/// A cartoon ship rides the waves across the screen while gold coins splash and gulls circle.
class PirateVoyageSim extends EffectSim {
  PirateVoyageSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  final _coins = <List<double>>[]; // x, y, vx, vy, spin, life
  double _coinTimer = 0.6;
  Size _size = Size.zero;

  double _wave(int layer, double x, double t, double base) =>
      base +
      math.sin(x * 0.012 + t * (1.2 + layer * 0.4) + layer * 2) * _size.height * 0.012 * (1 + layer * 0.5) +
      math.sin(x * 0.034 - t * 2 + layer) * _size.height * 0.005;

  double _base(double progress) =>
      _size.height -
      _size.height * 0.2 * _easeOutCubic(_phase(progress, 0, 0.15)) * (1 - _easeInOut(_phase(progress, 0.88, 1)));

  double _shipX(double progress) => (-0.35 + 1.7 * _phase(progress, 0.06, 0.94)) * _size.width;

  @override
  void update(double t, double dt, double progress, Size size) {
    _size = size;
    _coinTimer -= dt;
    final sx = _shipX(progress);
    if (_coinTimer <= 0 && progress < 0.85 && sx > 0 && sx < size.width) {
      _coinTimer = _rand(0.15, 0.4) / (0.6 + intensity);
      final sy = _wave(1, sx, t, _base(progress));
      for (var i = 0; i < 3; i++) {
        _coins.add([
          sx - size.width * 0.1,
          sy,
          _rand(-0.15, 0.05) * size.width,
          -_rand(0.35, 0.6) * size.height,
          _rand(0, 6),
          2,
        ]);
      }
      if (haptics) HapticFeedback.selectionClick();
    }
    for (final c in _coins) {
      c[3] += size.height * 0.9 * dt;
      c[0] += c[2] * dt;
      c[1] += c[3] * dt;
      c[4] += dt * 10;
      c[5] -= dt;
    }
    _coins.removeWhere((c) => c[5] <= 0 || c[1] > size.height);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    _size = size;
    final w = size.width, h = size.height;
    final m = math.min(w, h);
    final base = _base(progress);
    final seaH = h - base;
    if (seaH <= 0) return;
    const sea = [Color(0xE61D4ED8), Color(0xEB2563EB), Color(0xF238BDF8)];
    Path wave(int layer, double offset) {
      final p = Path()..moveTo(0, h);
      for (var x = 0.0; x <= w; x += 6) {
        p.lineTo(x, _wave(layer, x, t, base + offset));
      }
      return p
        ..lineTo(w, h)
        ..close();
    }

    for (var i = 0; i < 3; i++) {
      final x = ((i * 0.3 - 0.2) + 0.1 * t) * w;
      final y = (0.18 + i * 0.07) * h + math.sin(t + i) * h * 0.02;
      final flap = math.sin(t * 8 + i) * m * 0.015;
      final span = m * 0.035;
      canvas.drawPath(
        Path()
          ..moveTo(x - span, y - flap)
          ..quadraticBezierTo(x - span * 0.4, y - span * 0.6, x, y)
          ..quadraticBezierTo(x + span * 0.4, y - span * 0.6, x + span, y - flap),
        _stroke(const Color(0xFFF8FAFC), 2.5),
      );
    }
    canvas
      ..drawPath(wave(0, -seaH * 0.15), _fill(sea[0]))
      ..drawPath(wave(1, seaH * 0.1), _fill(sea[1]));
    final sx = _shipX(progress);
    final sy = _wave(1, sx, t, base + seaH * 0.1);
    final slope = (_wave(1, sx + 10, t, base) - _wave(1, sx - 10, t, base)) / 20;
    _drawShip(canvas, Offset(sx, sy), m * 0.5, math.atan(slope) * 0.8, t);
    canvas.drawPath(wave(2, seaH * 0.38), _fill(sea[2]));
    for (final c in _coins) {
      final r = m * 0.022;
      canvas
        ..save()
        ..translate(c[0], c[1])
        ..scale(math.cos(c[4]).abs() + 0.15, 1)
        ..drawCircle(Offset.zero, r, _fill(const Color(0xFFFACC15)))
        ..drawCircle(Offset.zero, r, _stroke(const Color(0xFFA16207), 2))
        ..restore();
    }
  }

  void _drawShip(Canvas canvas, Offset at, double l, double tilt, double t) {
    const outline = Color(0xFF451A03);
    final ink = _stroke(outline, 2.2);
    canvas
      ..save()
      ..translate(at.dx, at.dy)
      ..rotate(tilt)
      ..drawRect(Rect.fromLTWH(-l * 0.12, -l * 0.75, l * 0.025, l * 0.62), _fill(const Color(0xFF78350F)))
      ..drawRect(Rect.fromLTWH(l * 0.13, -l * 0.62, l * 0.022, l * 0.5), _fill(const Color(0xFF78350F)));
    final bil = math.sin(t * 2) * l * 0.015;
    void sail(double mx, double top, double bottom, double width) {
      final p = Path()
        ..moveTo(mx - width * 0.5, top)
        ..quadraticBezierTo(mx + width * 0.15 + bil, (top + bottom) / 2, mx - width * 0.5, bottom)
        ..lineTo(mx + width * 0.5, bottom)
        ..quadraticBezierTo(mx + width * 0.85 + bil, (top + bottom) / 2, mx + width * 0.5, top)
        ..close();
      canvas
        ..drawPath(p, _fill(const Color(0xFFFEF3C7)))
        ..drawPath(p, ink);
    }

    sail(-l * 0.11, -l * 0.7, -l * 0.42, l * 0.3);
    sail(-l * 0.11, -l * 0.38, -l * 0.17, l * 0.36);
    sail(l * 0.14, -l * 0.57, -l * 0.18, l * 0.28);
    canvas.drawPath(_star(Offset(-l * 0.07, -l * 0.28), l * 0.05), _fill(const Color(0xFFF59E0B)));
    final wave = math.sin(t * 6) * l * 0.02;
    final flag = Path()
      ..moveTo(-l * 0.11, -l * 0.75)
      ..quadraticBezierTo(-l * 0.02, -l * 0.77 + wave, l * 0.05, -l * 0.72 + wave)
      ..lineTo(-l * 0.11, -l * 0.68)
      ..close();
    canvas
      ..drawPath(flag, _fill(const Color(0xFFDC2626)))
      ..drawPath(flag, ink);
    final hull = Path()
      ..moveTo(-l * 0.5, -l * 0.14)
      ..lineTo(l * 0.42, -l * 0.14)
      ..quadraticBezierTo(l * 0.5, -l * 0.13, l * 0.55, -l * 0.2)
      ..quadraticBezierTo(l * 0.4, l * 0.06, l * 0.25, l * 0.06)
      ..lineTo(-l * 0.36, l * 0.06)
      ..quadraticBezierTo(-l * 0.48, l * 0.02, -l * 0.5, -l * 0.14)
      ..close();
    canvas
      ..drawPath(hull, _fill(const Color(0xFF92400E)))
      ..drawPath(hull, ink)
      ..drawLine(Offset(-l * 0.48, -l * 0.08), Offset(l * 0.46, -l * 0.08), _stroke(const Color(0xFFFBBF24), 2));
    for (var i = 0; i < 4; i++) {
      canvas.drawCircle(Offset(-l * 0.3 + i * l * 0.17, -l * 0.02), l * 0.018, _fill(const Color(0xFF1C1917)));
    }
    canvas.restore();
  }
}

// ------------------------------------------------------------------------------------------ cartoon parade

class _Critter {
  _Critter(this.color, this.belly, this.feature, this.x, this.speed, this.size, this.blinkAt);
  final Color color;
  final Color belly;
  final int feature; // 0 ears, 1 antenna, 2 bunny, 3 horn, 4 tuft, 5 plain
  double x;
  double hop = 0;
  final double speed;
  final double size;
  final double blinkAt;
  bool landed = false;
}

/// A band of bouncy original critters hops in from the left along the bottom, popping hearts and stars.
class CartoonParadeSim extends EffectSim {
  CartoonParadeSim(this.intensity, this.haptics);
  final double intensity;
  final bool haptics;
  static const _cast = [
    (Color(0xFFF472B6), Color(0xFFFBCFE8)),
    (Color(0xFFA3E635), Color(0xFFECFCCB)),
    (Color(0xFF38BDF8), Color(0xFFE0F2FE)),
    (Color(0xFFFACC15), Color(0xFFFEF9C3)),
    (Color(0xFFFB923C), Color(0xFFFFEDD5)),
    (Color(0xFFC084FC), Color(0xFFF3E8FF)),
  ];
  final _critters = <_Critter>[];
  final _pops = <List<double>>[]; // x, y, kind, life, hue
  int _spawned = 0;
  double _next = 0.2;

  @override
  void update(double t, double dt, double progress, Size size) {
    final m = math.min(size.width, size.height);
    if (t >= _next && _spawned < _cast.length + (intensity * 3).round() && progress < 0.6) {
      final (color, belly) = _cast[_spawned % _cast.length];
      final z = m * _rand(0.1, 0.13);
      _critters.add(_Critter(color, belly, _spawned % 6, -z * 1.5, size.width * _rand(0.22, 0.3), z, _rand(0, 3)));
      _spawned++;
      _next = t + _rand(0.35, 0.6);
    }
    final exit = _phase(progress, 0.85, 1);
    for (final c in _critters) {
      c.x += c.speed * dt * (1 + exit * 2);
      c.hop += dt * 6.5;
      final contact = math.sin(c.hop).abs() < 0.18;
      if (contact && !c.landed) {
        c.landed = true;
        if (_rng.nextDouble() < 0.35) {
          _pops.add([c.x, size.height * 0.88 - c.size * 1.8, _rng.nextBool() ? 0 : 1, 1, _rand(0, 360)]);
          if (haptics) HapticFeedback.selectionClick();
        }
      }
      if (!contact) c.landed = false;
    }
    for (final p in _pops) {
      p[1] -= m * 0.12 * dt;
      p[3] -= dt * 0.9;
    }
    _pops.removeWhere((p) => p[3] <= 0);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    const ink = Color(0xFF1F2937);
    final ground = size.height * 0.9;
    final m = math.min(size.width, size.height);
    for (final c in _critters) {
      final air = math.sin(c.hop).abs();
      final z = c.size;
      final y = ground - air * z * 1.1;
      final contact = air < 0.18;
      canvas.drawOval(
        Rect.fromCenter(center: Offset(c.x, ground + z * 0.05), width: z * 1.4 * (1 - air * 0.3), height: z * 0.24),
        _fill(Color.fromRGBO(0, 0, 0, 0.2 * (1 - air * 0.6))),
      );
      canvas
        ..save()
        ..translate(c.x, y)
        ..scale(contact ? 1.18 : 1 - air * 0.08, contact ? 0.82 : 1 + air * 0.1);
      final line = _stroke(ink, 2.2);
      _feature(canvas, c.feature, c.color, z, t, line);
      final step = math.sin(c.hop * 2) * z * 0.12;
      for (final sgn in [-1.0, 1.0]) {
        final foot = Rect.fromCenter(
          center: Offset(sgn * z * 0.3 + sgn * step, -z * 0.04),
          width: z * 0.36,
          height: z * 0.2,
        );
        canvas
          ..drawOval(foot, _fill(c.color))
          ..drawOval(foot, line);
      }
      final body = Rect.fromCenter(center: Offset(0, -z * 0.6), width: z * 1.24, height: z * 1.2);
      canvas
        ..drawOval(body, _fill(c.color))
        ..drawOval(body, line)
        ..drawOval(
          Rect.fromCenter(center: Offset(z * 0.05, -z * 0.42), width: z * 0.72, height: z * 0.6),
          _fill(c.belly),
        );
      final blink = (t + c.blinkAt) % 3 < 0.12 ? 0.12 : 1.0;
      for (final ex in [-z * 0.05, z * 0.27]) {
        final eye = Rect.fromCenter(center: Offset(ex, -z * 0.78), width: z * 0.28, height: z * 0.34 * blink);
        canvas
          ..drawOval(eye, _fill(const Color(0xFFFFFFFF)))
          ..drawOval(eye, line);
        if (blink > 0.5) {
          canvas
            ..drawCircle(Offset(ex + z * 0.05, -z * 0.76), z * 0.065, _fill(ink))
            ..drawCircle(Offset(ex + z * 0.07, -z * 0.79), z * 0.022, _fill(const Color(0xFFFFFFFF)));
        }
      }
      canvas
        ..drawArc(
          Rect.fromCircle(center: Offset(z * 0.12, -z * 0.6), radius: z * 0.12),
          0.2 * math.pi,
          0.6 * math.pi,
          false,
          line,
        )
        ..restore();
    }
    for (final p in _pops) {
      final c = Offset(p[0], p[1]);
      final r = m * 0.035 * (1.2 - p[3] * 0.4);
      final a = math.min(1.0, p[3] * 1.5);
      final path = p[2] == 0 ? _heart(c, r) : _star(c, r, inner: 0.5, rot: t * 2);
      canvas
        ..drawPath(
          path,
          _fill(
            (p[2] == 0 ? const Color(0xFFF43F5E) : HSLColor.fromAHSL(1, p[4], 0.9, 0.65).toColor()).withValues(
              alpha: a,
            ),
          ),
        )
        ..drawPath(path, _stroke(ink.withValues(alpha: a), 2));
    }
  }

  void _feature(Canvas canvas, int feature, Color color, double z, double t, Paint line) {
    void shape(Path p, [Color? c]) => canvas
      ..drawPath(p, _fill(c ?? color))
      ..drawPath(p, line);
    switch (feature) {
      case 0:
        for (final sgn in [-1.0, 1.0]) {
          shape(
            Path()
              ..moveTo(sgn * z * 0.45, -z * 0.95)
              ..lineTo(sgn * z * 0.3, -z * 1.35)
              ..lineTo(sgn * z * 0.1, -z * 1.1)
              ..close(),
          );
        }
      case 1:
        canvas.drawPath(
          Path()
            ..moveTo(z * 0.05, -z * 1.15)
            ..quadraticBezierTo(z * 0.25 + math.sin(t * 5) * z * 0.1, -z * 1.45, z * 0.15, -z * 1.6),
          line,
        );
        shape(
          Path()..addOval(Rect.fromCircle(center: Offset(z * 0.15, -z * 1.62), radius: z * 0.09)),
          const Color(0xFFFDE047),
        );
      case 2:
        for (final sgn in [-1.0, 1.0]) {
          shape(
            Path()
              ..addOval(Rect.fromCenter(center: Offset(sgn * z * 0.2, -z * 1.35), width: z * 0.2, height: z * 0.76)),
          );
        }
      case 3:
        shape(
          Path()
            ..moveTo(-z * 0.08, -z * 1.12)
            ..lineTo(z * 0.08, -z * 1.55)
            ..lineTo(z * 0.22, -z * 1.12)
            ..close(),
          const Color(0xFFFEF3C7),
        );
      case 4:
        for (var i = -1; i <= 1; i++) {
          shape(
            Path()
              ..addOval(Rect.fromCenter(center: Offset(i * z * 0.12, -z * 1.22), width: z * 0.14, height: z * 0.32)),
          );
        }
      default:
        break;
    }
  }

  Path _heart(Offset c, double r) => Path()
    ..moveTo(c.dx, c.dy + r * 0.7)
    ..cubicTo(c.dx - r * 1.2, c.dy - r * 0.1, c.dx - r * 0.6, c.dy - r * 1.1, c.dx, c.dy - r * 0.4)
    ..cubicTo(c.dx + r * 0.6, c.dy - r * 1.1, c.dx + r * 1.2, c.dy - r * 0.1, c.dx, c.dy + r * 0.7)
    ..close();
}
