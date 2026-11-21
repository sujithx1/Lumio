import 'dart:async';

import 'package:flutter/material.dart';

import 'core/engine.dart';
import 'effects/catalog.dart';
import 'screens/devices_screen.dart';
import 'screens/effect_screen.dart';
import 'screens/effects_screen.dart';
import 'screens/home_screen.dart';
import 'screens/pair_screen.dart';
import 'theme/theme.dart';
import 'theme/tokens.g.dart';
import 'widgets/send_sheet.dart';

/// Makes the engine available to every widget; rebuilds dependents when it notifies.
class LumioScope extends InheritedNotifier<LumioEngine> {
  const LumioScope({super.key, required LumioEngine engine, required super.child}) : super(notifier: engine);

  static LumioEngine of(BuildContext context) => context.dependOnInheritedWidgetOfExactType<LumioScope>()!.notifier!;
  static LumioEngine read(BuildContext context) => context.getInheritedWidgetOfExactType<LumioScope>()!.notifier!;
}

class LumioApp extends StatelessWidget {
  const LumioApp({super.key, required this.engine, this.onChangeServer});

  final LumioEngine engine;

  /// Switches to another relay server (re-registers this device there).
  final Future<void> Function(String url)? onChangeServer;

  @override
  Widget build(BuildContext context) => LumioScope(
    engine: engine,
    child: MaterialApp(
      title: 'Lumio',
      debugShowCheckedModeBanner: false,
      theme: buildLumioTheme(),
      home: Shell(onChangeServer: onChangeServer),
    ),
  );
}

class Shell extends StatefulWidget {
  const Shell({super.key, this.onChangeServer});
  final Future<void> Function(String url)? onChangeServer;

  @override
  State<Shell> createState() => _ShellState();
}

class _ShellState extends State<Shell> with WidgetsBindingObserver {
  int _tab = 0;
  StreamSubscription<CoreEvent>? _sub;
  bool _showingRequest = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _sub?.cancel();
    _sub = LumioScope.read(context).events.listen(_onEvent);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _sub?.cancel();
    super.dispose();
  }

  /// iOS and Android suspend sockets in the background; reconnect as soon as we're back.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) LumioScope.read(context).reconnectNow();
  }

  void _snack(String message, {Color? color}) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message), backgroundColor: color, behavior: SnackBarBehavior.floating));
  }

  void _onEvent(CoreEvent e) {
    final engine = LumioScope.read(context);
    switch (e) {
      case EffectIncomingEvent(:final effect):
        final def = engine.catalog.byId(effect.effectId)!;
        Navigator.of(context).push(
          PageRouteBuilder<void>(
            opaque: true,
            transitionDuration: LumioMotion.base,
            pageBuilder: (_, _, _) => EffectScreen(
              effect: def,
              duration: effect.duration,
              intensity: effect.intensity,
              haptics: effect.sound,
              fromName: effect.fromName,
              onFinished: (ok) => engine.finishIncoming(effect.eventId, completed: ok),
            ),
            transitionsBuilder: (_, a, _, child) => FadeTransition(opacity: a, child: child),
          ),
        );
      case PairRequestEvent():
        if (!_showingRequest) {
          _showingRequest = true;
          showModalBottomSheet<void>(
            context: context,
            isScrollControlled: true,
            builder: (_) => PairRequestSheet(request: e),
          ).whenComplete(() => _showingRequest = false);
        }
      case PairApprovedEvent(:final peer):
        _snack('Paired with ${peer.name}');
      case PairRevokedEvent(:final peerName):
        _snack('$peerName was unpaired');
      case EffectRejectedEvent(:final fromName, :final reason):
        _snack('Blocked an effect from $fromName (${reason.replaceAll('_', ' ')})');
      case DeliveryEvent(:final status, :final detail) when status == 'failed' || status == 'receiver_offline':
        _snack(
          status == 'receiver_offline'
              ? 'That device is offline.'
              : 'Effect not shown${detail != null ? ': ${detail.replaceAll('_', ' ')}' : ''}.',
          color: LumioColors.danger.withValues(alpha: 0.9),
        );
      case ErrorEvent(:final message):
        _snack(message);
      default:
        break;
    }
  }

  void _openPairing() => Navigator.of(context).push(MaterialPageRoute<void>(builder: (_) => const PairScreen()));
  void _openSend({String? effectId, String? deviceId}) =>
      showSendSheet(context, effectId: effectId, deviceId: deviceId);

  @override
  Widget build(BuildContext context) {
    final pages = [
      HomeScreen(onPair: _openPairing, onSend: _openSend),
      EffectsScreen(onSend: _openSend),
      DevicesScreen(onPair: _openPairing, onChangeServer: widget.onChangeServer),
    ];
    return Scaffold(
      body: IndexedStack(index: _tab, children: pages),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home_rounded), label: 'Home'),
          NavigationDestination(
            icon: Icon(Icons.auto_awesome_outlined),
            selectedIcon: Icon(Icons.auto_awesome),
            label: 'Effects',
          ),
          NavigationDestination(
            icon: Icon(Icons.devices_outlined),
            selectedIcon: Icon(Icons.devices),
            label: 'Devices',
          ),
        ],
      ),
    );
  }
}

/// Shown when a device has claimed this device's pairing code.
class PairRequestSheet extends StatefulWidget {
  const PairRequestSheet({super.key, required this.request});
  final PairRequestEvent request;

  @override
  State<PairRequestSheet> createState() => _PairRequestSheetState();
}

class _PairRequestSheetState extends State<PairRequestSheet> {
  bool _busy = false;
  String? _error;

  Future<void> _act(bool approve) async {
    final engine = LumioScope.read(context);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      approve
          ? await engine.api.approvePairing(widget.request.pairingId)
          : await engine.api.rejectPairing(widget.request.pairingId);
      if (mounted) Navigator.of(context).pop();
    } catch (e) {
      setState(() => _error = e.toString());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final r = widget.request;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.all(LumioSpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text('Pair with ${r.claimant.name}?', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: LumioSpace.xs),
            Text('Check that the other device shows the same number.', style: text.bodySmall),
            const SizedBox(height: LumioSpace.xl),
            SasDigits(r.sas),
            if (_error != null)
              Padding(
                padding: const EdgeInsets.only(top: LumioSpace.md),
                child: Text(_error!, style: const TextStyle(color: LumioColors.danger)),
              ),
            const SizedBox(height: LumioSpace.xl),
            Row(
              children: [
                Expanded(
                  child: OutlinedButton(onPressed: _busy ? null : () => _act(false), child: const Text('Decline')),
                ),
                const SizedBox(width: LumioSpace.md),
                Expanded(
                  child: FilledButton(onPressed: _busy ? null : () => _act(true), child: const Text('Numbers match')),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class SasDigits extends StatelessWidget {
  const SasDigits(this.digits, {super.key});
  final String digits;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisAlignment: MainAxisAlignment.center,
    children: [
      for (var i = 0; i < digits.length; i++)
        Container(
          width: 42,
          height: 54,
          margin: EdgeInsets.only(left: i == 3 ? 14 : 4, right: 4),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: LumioColors.bg,
            borderRadius: BorderRadius.circular(LumioRadius.sm),
            border: Border.all(color: LumioColors.border),
          ),
          child: Text(
            digits[i],
            style: const TextStyle(
              fontSize: 26,
              fontWeight: FontWeight.w600,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ),
    ],
  );
}

/// Exposed for tests and previews.
EffectCatalog catalogOf(BuildContext context) => LumioScope.read(context).catalog;
