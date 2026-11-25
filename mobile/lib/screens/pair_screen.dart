import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../app.dart';
import '../core/api.dart';
import '../core/engine.dart';
import '../theme/tokens.g.dart';

/// Pairing from a phone: scan a QR code (usually shown by a computer), type a code, or show one.
class PairScreen extends StatefulWidget {
  const PairScreen({super.key});

  @override
  State<PairScreen> createState() => _PairScreenState();
}

class _PairScreenState extends State<PairScreen> {
  int _mode = 0; // 0 scan, 1 enter, 2 show
  PairingClaimed? _claimed;
  String? _error;
  bool _busy = false;
  StreamSubscription<CoreEvent>? _sub;
  DeviceSummary? _paired;
  bool _declined = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sub?.cancel();
    _sub = LumioScope.read(context).events.listen((e) {
      if (!mounted) return;
      switch (e) {
        case PairApprovedEvent(:final peer):
          setState(() => _paired = peer);
        case PairRejectedEvent(:final pairingId) when pairingId == _claimed?.pairingId:
          setState(() => _declined = true);
        default:
          break;
      }
    });
  }

  @override
  void dispose() {
    _sub?.cancel();
    super.dispose();
  }

  /// Accepts `lumio://pair?code=…&server=…` (from a QR code) or a bare code.
  Future<void> _claim(String input) async {
    if (_busy || _claimed != null) return;
    final engine = LumioScope.read(context);
    var code = input.trim();
    final uri = Uri.tryParse(code);
    if (uri != null && uri.scheme == 'lumio') {
      if (uri.host != 'pair' || uri.queryParameters['code'] == null) {
        setState(() => _error = "That QR code isn't a Lumio pairing code.");
        return;
      }
      final server = uri.queryParameters['server']?.replaceAll(RegExp(r'/+$'), '');
      if (server != null && !sameRelay(server, engine.api.baseUrl)) {
        setState(() => _error = 'That device uses a different relay server ($server). Change it under Devices first.');
        return;
      }
      code = uri.queryParameters['code']!;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final claimed = await engine.api.claimPairing(code);
      HapticFeedback.selectionClick();
      setState(() => _claimed = claimed);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    Widget body;
    if (_paired != null) {
      body = _Result(
        icon: Icons.check_rounded,
        color: LumioColors.online,
        title: 'Paired with ${_paired!.name}',
        body: 'You can now send effects to each other.',
        onDone: () => Navigator.of(context).pop(),
      );
    } else if (_claimed != null) {
      body = _declined
          ? _Result(
              icon: Icons.close_rounded,
              color: LumioColors.danger,
              title: '${_claimed!.initiator.name} declined',
              body: 'Nothing was paired.',
              onDone: () => Navigator.of(context).pop(),
            )
          : Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Confirm on ${_claimed!.initiator.name}',
                  style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: LumioSpace.xs),
                Text('It should show this number:', style: text.bodySmall),
                const SizedBox(height: LumioSpace.xl),
                SasDigits(_claimed!.sas),
                const SizedBox(height: LumioSpace.xl),
                const Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2)),
                    SizedBox(width: 10),
                    Text('Waiting for approval…'),
                  ],
                ),
              ],
            );
    } else {
      body = Column(
        children: [
          SegmentedButton<int>(
            segments: const [
              ButtonSegment(value: 0, icon: Icon(Icons.qr_code_scanner_rounded), label: Text('Scan')),
              ButtonSegment(value: 1, icon: Icon(Icons.keyboard_rounded), label: Text('Enter')),
              ButtonSegment(value: 2, icon: Icon(Icons.qr_code_rounded), label: Text('Show')),
            ],
            selected: {_mode},
            onSelectionChanged: (s) => setState(() {
              _mode = s.first;
              _error = null;
            }),
          ),
          const SizedBox(height: LumioSpace.xl),
          Expanded(
            child: switch (_mode) {
              0 => _Scanner(onCode: _claim, busy: _busy),
              1 => _EnterCode(onSubmit: _claim, busy: _busy),
              _ => const _ShowCode(),
            },
          ),
          if (_error != null)
            Padding(
              padding: const EdgeInsets.only(top: LumioSpace.md),
              child: Text(
                _error!,
                style: const TextStyle(color: LumioColors.danger),
                textAlign: TextAlign.center,
              ),
            ),
        ],
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Pair a device'), backgroundColor: Colors.transparent),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(LumioSpace.xl),
          child: Center(child: body),
        ),
      ),
    );
  }
}

class _Scanner extends StatelessWidget {
  const _Scanner({required this.onCode, required this.busy});
  final void Function(String) onCode;
  final bool busy;

  @override
  Widget build(BuildContext context) => Column(
    children: [
      Expanded(
        child: ClipRRect(
          borderRadius: BorderRadius.circular(LumioRadius.xl),
          child: MobileScanner(
            onDetect: (capture) {
              final value = capture.barcodes.map((b) => b.rawValue).whereType<String>().firstOrNull;
              if (value != null && !busy) onCode(value);
            },
            errorBuilder: (_, error) => Container(
              color: LumioColors.surface,
              padding: const EdgeInsets.all(LumioSpace.xl),
              alignment: Alignment.center,
              child: Text(
                error.errorCode == MobileScannerErrorCode.permissionDenied
                    ? 'Camera access is off. Allow it in Settings, or enter the code instead.'
                    : 'The camera is unavailable here. Enter the code instead.',
                textAlign: TextAlign.center,
              ),
            ),
          ),
        ),
      ),
      const SizedBox(height: LumioSpace.md),
      Text('Point at the QR code in Lumio on your computer.', style: Theme.of(context).textTheme.bodySmall),
    ],
  );
}

class _EnterCode extends StatefulWidget {
  const _EnterCode({required this.onSubmit, required this.busy});
  final void Function(String) onSubmit;
  final bool busy;

  @override
  State<_EnterCode> createState() => _EnterCodeState();
}

class _EnterCodeState extends State<_EnterCode> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final clean = _controller.text.replaceAll(RegExp('[^0-9A-Za-z]'), '');
    return Column(
      children: [
        TextField(
          controller: _controller,
          autofocus: true,
          textAlign: TextAlign.center,
          textCapitalization: TextCapitalization.characters,
          autocorrect: false,
          enableSuggestions: false,
          maxLength: 11,
          style: const TextStyle(fontSize: 24, letterSpacing: 4, fontWeight: FontWeight.w600),
          decoration: const InputDecoration(hintText: 'XXXXX-XXXXX', counterText: ''),
          onChanged: (_) => setState(() {}),
          onSubmitted: widget.onSubmit,
        ),
        const SizedBox(height: LumioSpace.xl),
        FilledButton(
          onPressed: clean.length == 10 && !widget.busy ? () => widget.onSubmit(_controller.text) : null,
          child: widget.busy
              ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
              : const Text('Pair'),
        ),
      ],
    );
  }
}

class _ShowCode extends StatefulWidget {
  const _ShowCode();

  @override
  State<_ShowCode> createState() => _ShowCodeState();
}

class _ShowCodeState extends State<_ShowCode> {
  PairingCreated? _session;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _start());
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => mounted ? setState(() {}) : null);
  }

  Future<void> _start() async {
    final engine = LumioScope.read(context);
    setState(() {
      _session = null;
      _error = null;
    });
    try {
      final s = await engine.api.createPairing();
      if (mounted) setState(() => _session = s);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    if (_error != null) {
      return Center(
        child: TextButton(onPressed: _start, child: Text('$_error  Try again')),
      );
    }
    final s = _session;
    if (s == null) return const Center(child: CircularProgressIndicator());
    final remaining = ((s.expiresAt - DateTime.now().millisecondsSinceEpoch) / 1000).round();
    if (remaining <= 0) {
      return Center(
        child: FilledButton(onPressed: _start, child: const Text('New code')),
      );
    }
    final uri = Uri(
      scheme: 'lumio',
      host: 'pair',
      queryParameters: {'code': s.code, 'server': LumioScope.read(context).api.baseUrl},
    );
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(LumioSpace.md),
          decoration: BoxDecoration(color: LumioColors.text, borderRadius: BorderRadius.circular(LumioRadius.lg)),
          child: QrImageView(data: uri.toString(), size: 200, padding: EdgeInsets.zero),
        ),
        const SizedBox(height: LumioSpace.xl),
        Text(s.code, style: const TextStyle(fontSize: 26, letterSpacing: 4, fontWeight: FontWeight.w600)),
        const SizedBox(height: LumioSpace.sm),
        Text(
          'Waiting for the other device · ${remaining ~/ 60}:${(remaining % 60).toString().padLeft(2, '0')}',
          style: text.bodySmall,
        ),
      ],
    );
  }
}

class _Result extends StatelessWidget {
  const _Result({
    required this.icon,
    required this.color,
    required this.title,
    required this.body,
    required this.onDone,
  });
  final IconData icon;
  final Color color;
  final String title;
  final String body;
  final VoidCallback onDone;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        CircleAvatar(
          radius: 30,
          backgroundColor: color.withValues(alpha: 0.15),
          child: Icon(icon, color: color, size: 30),
        ),
        const SizedBox(height: LumioSpace.lg),
        Text(
          title,
          style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: LumioSpace.xs),
        Text(body, style: text.bodySmall),
        const SizedBox(height: LumioSpace.xl),
        FilledButton(onPressed: onDone, child: const Text('Done')),
      ],
    );
  }
}

/// Whether two relay URLs point at the same server. Host names are case-insensitive and a trailing slash
/// or an explicit default port makes no difference.
bool sameRelay(String a, String b) {
  final x = Uri.tryParse(a.trim());
  final y = Uri.tryParse(b.trim());
  if (x == null || y == null || !x.hasScheme || !y.hasScheme) return a.trim() == b.trim();
  String path(Uri u) => u.path.replaceAll(RegExp(r'/+$'), '');
  return x.scheme.toLowerCase() == y.scheme.toLowerCase() &&
      x.host.toLowerCase() == y.host.toLowerCase() &&
      x.port == y.port &&
      path(x) == path(y);
}
