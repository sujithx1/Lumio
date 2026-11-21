// Mobile effect renderers. Same catalog and visual intent as desktop (desktop/src/effects),
// implemented with Flutter fragment shaders and CustomPainter simulations.
import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/painting.dart';
import 'package:flutter/services.dart';

/// One running effect. `update` advances the simulation; `paint` draws the current frame.
abstract class EffectSim {
  void update(double t, double dt, double progress, Size size) {}
  void paint(Canvas canvas, Size size, double t, double progress);
  void dispose() {}
}

typedef SimFactory = Future<EffectSim> Function(double intensity, bool haptics);

final _rng = math.Random();
double _rand(double min, double max) => min + _rng.nextDouble() * (max - min);

/// Renderers available on mobile, keyed by catalog id.
final Map<String, SimFactory> renderers = {
  'cosmic-portal': (i, _) => ShaderSim.load('shaders/cosmic_portal.frag', i),
  'aurora': (i, _) => ShaderSim.load('shaders/aurora.frag', i),
  'volcano': (i, _) => ShaderSim.load('shaders/volcano.frag', i),
  'rainbow': (i, _) async => RainbowSim(i),
  'lightning': (i, h) async => LightningSim(i, h),
  'celebration': (i, h) async => CelebrationSim(i, h),
  'matrix': (i, _) async => MatrixSim(i),
  'fireworks': (i, h) async => FireworksSim(i, h),
};

// ------------------------------------------------------------------------------------------ shaders

const shaderAssets = ['shaders/cosmic_portal.frag', 'shaders/aurora.frag', 'shaders/volcano.frag'];

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

class RainbowSim extends EffectSim {
  RainbowSim(this.intensity);
  final double intensity;
  static const _hues = [0.0, 28.0, 52.0, 120.0, 200.0, 240.0, 280.0];

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF0A0C1C), Color(0xFF05060C)],
        ).createShader(Offset.zero & size),
    );
    final sweep = 1 - math.pow(1 - (t / 1.8).clamp(0.0, 1.0), 3).toDouble();
    final fade = 1 - ((progress - 0.8) / 0.2).clamp(0.0, 1.0);
    final m = math.min(size.width, size.height);
    final center = Offset(size.width / 2, size.height * 0.75);
    final base = m * 0.55;
    final band = m * (0.04 + 0.02 * intensity);
    for (var i = 0; i < _hues.length; i++) {
      final r = base + (_hues.length - 1 - i) * band; // Red outside.
      final shimmer = 0.75 + 0.25 * math.sin(t * 2 + i * 0.7);
      final color = HSLColor.fromAHSL(
        ((0.35 + 0.35 * intensity) * shimmer * fade).clamp(0, 1),
        _hues[i],
        0.95,
        0.6,
      ).toColor();
      final paint = Paint()
        ..color = color
        ..style = PaintingStyle.stroke
        ..strokeWidth = band * 1.05
        ..strokeCap = StrokeCap.round
        ..blendMode = BlendMode.plus
        ..maskFilter = const MaskFilter.blur(BlurStyle.normal, 6);
      canvas.drawArc(Rect.fromCircle(center: center, radius: r), math.pi, math.pi * sweep, false, paint);
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
  double _next = 0.25;

  List<Offset> _path(Offset a, Offset b, double spread, int depth) {
    var pts = [a, b];
    for (var d = 0; d < depth; d++) {
      final next = <Offset>[];
      for (var i = 0; i < pts.length - 1; i++) {
        final mid = (pts[i] + pts[i + 1]) / 2;
        next
          ..add(pts[i])
          ..add(mid + Offset(_rand(-spread, spread), _rand(-spread, spread) * 0.3));
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
    if (t >= _next && progress < 0.88) {
      final x0 = _rand(size.width * 0.15, size.width * 0.85);
      final main = _path(
        Offset(x0, -10),
        Offset(x0 + _rand(-0.15, 0.15) * size.width, size.height * _rand(0.75, 1.0)),
        size.width * 0.12,
        7,
      );
      final paths = [_toPath(main)];
      for (var i = 0; i < 2 + (intensity * 4).floor(); i++) {
        final s = main[(_rand(0.2, 0.7) * main.length).floor()];
        paths.add(
          _toPath(
            _path(s, s + Offset(_rand(-0.2, 0.2) * size.width, _rand(0.1, 0.35) * size.height), size.width * 0.05, 5),
          ),
        );
      }
      _bolts.add(_Bolt(paths, t));
      _flash = math.min(1, _flash + 0.6 + 0.4 * intensity);
      if (haptics) HapticFeedback.heavyImpact();
      _next = t + _rand(0.4, 1.6) / (0.7 + 1.8 * intensity);
    }
    _flash *= math.pow(0.02, dt);
    _bolts.removeWhere((b) => t - b.born > 0.6);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = const LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [Color(0xFF0B0F22), Color(0xFF03040A)],
        ).createShader(Offset.zero & size),
    );
    if (_flash > 0.01) {
      canvas.drawRect(Offset.zero & size, Paint()..color = Color.fromRGBO(190, 205, 255, _flash * 0.35));
    }
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
        for (final (width, alpha, blur) in [(10.0, 0.18, 14.0), (3.2, 0.9, 4.0), (1.2, 1.0, 0.0)]) {
          canvas.drawPath(
            b.paths[i],
            Paint()
              ..style = PaintingStyle.stroke
              ..strokeWidth = width * scale
              ..strokeJoin = StrokeJoin.round
              ..blendMode = BlendMode.plus
              ..color = Color.fromRGBO(210, 222, 255, alpha * flicker * (i == 0 ? 1 : 0.7))
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
      final count = (40 + 70 * intensity).round();
      for (final left in [true, false]) {
        for (var i = 0; i < count; i++) {
          final angle = left ? _rand(-1.35, -0.75) : _rand(-2.4, -1.8);
          final speed = _rand(0.9, 1.6) * size.height * 1.05;
          _pieces.add(
            _Confetto(
              Offset(left ? -10 : size.width + 10, size.height + 10),
              Offset(math.cos(angle), math.sin(angle)) * speed,
              _rand(0, math.pi * 2),
              _rand(-8, 8),
              Size(_rand(6, 11), _rand(3, 6)),
              _confettiColors[_rng.nextInt(_confettiColors.length)],
              _rand(0, math.pi * 2),
            ),
          );
        }
      }
      if (haptics) HapticFeedback.mediumImpact();
      _next = t + 1.1 - 0.4 * intensity;
    }
    final gravity = size.height * 0.9;
    for (final p in _pieces) {
      p.vel = Offset(p.vel.dx * math.pow(0.35, dt), (p.vel.dy + gravity * dt) * math.pow(0.55, dt));
      p.pos += Offset(p.vel.dx + math.sin(t * 3 + p.phase) * 40, p.vel.dy) * dt;
      p.rot += p.vr * dt;
    }
    _pieces.removeWhere((p) => p.pos.dy > size.height + 40);
  }

  @override
  void paint(Canvas canvas, Size size, double t, double progress) {
    canvas.drawRect(
      Offset.zero & size,
      Paint()
        ..shader = RadialGradient(
          center: Alignment.bottomCenter,
          radius: 1.4,
          colors: const [Color(0xFF151030), Color(0xFF06060C)],
        ).createShader(Offset.zero & size),
    );
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
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF000000));
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
          _rand(size.width * 0.15, size.width * 0.85),
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
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFF04050A));
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
      // A short streak from the previous position stands in for the desktop's trail buffer.
      canvas.drawLine(s.prev - (s.pos - s.prev) * 3, s.pos, glow);
    }
  }
}
