import 'package:flutter/material.dart';

import '../app.dart';
import '../core/engine.dart';
import '../theme/tokens.g.dart';
import 'common.dart';

Future<void> showSendSheet(BuildContext context, {String? effectId, String? deviceId}) => showModalBottomSheet<void>(
  context: context,
  isScrollControlled: true,
  showDragHandle: true,
  builder: (_) => SendSheet(effectId: effectId, deviceId: deviceId),
);

const _steps = [('sending', 'Sending'), ('relayed', 'Relayed'), ('received', 'Playing'), ('completed', 'Done')];

class SendSheet extends StatefulWidget {
  const SendSheet({super.key, this.effectId, this.deviceId});
  final String? effectId;
  final String? deviceId;

  @override
  State<SendSheet> createState() => _SendSheetState();
}

class _SendSheetState extends State<SendSheet> {
  late String _effectId;
  String? _deviceId;
  late double _duration;
  late double _intensity;
  late bool _haptics;
  String? _eventId;
  String? _error;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_eventId != null || _error != null) return;
    final engine = LumioScope.read(context);
    final e = engine.catalog.byId(widget.effectId ?? '') ?? engine.catalog.effects.first;
    _pick(e.id);
    final online = engine.peers.where((p) => p.online);
    _deviceId ??= widget.deviceId ?? (online.isNotEmpty ? online.first.deviceId : null);
  }

  void _pick(String id) {
    final e = LumioScope.read(context).catalog.byId(id)!;
    _effectId = id;
    _duration = e.defaultDuration.toDouble();
    _intensity = e.defaultIntensity;
    _haptics = e.hasSound;
    _eventId = null;
  }

  Future<void> _send() async {
    final engine = LumioScope.read(context);
    setState(() => _error = null);
    try {
      final id = await engine.sendEffect(_deviceId!, _effectId, _duration.round(), _intensity, _haptics);
      setState(() => _eventId = id);
    } catch (e) {
      setState(() => _error = e.toString().replaceFirst('Bad state: ', ''));
    }
  }

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final text = Theme.of(context).textTheme;
    final effect = engine.catalog.byId(_effectId)!;
    final delivery = _eventId == null ? null : engine.deliveries[_eventId];
    final status = delivery?.status;
    final failed = status == 'failed' || status == 'receiver_offline' || status == 'expired' || status == 'rejected';
    final inFlight = status != null && !failed && status != 'completed';
    final target = engine.peers.where((p) => p.deviceId == _deviceId).firstOrNull;

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          LumioSpace.xl,
          0,
          LumioSpace.xl,
          LumioSpace.xl + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Send an effect', style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600)),
            const SizedBox(height: LumioSpace.lg),
            SizedBox(
              height: 74,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: engine.catalog.effects.length,
                separatorBuilder: (_, _) => const SizedBox(width: LumioSpace.sm),
                itemBuilder: (_, i) {
                  final e = engine.catalog.effects[i];
                  final selected = e.id == _effectId;
                  return GestureDetector(
                    onTap: () => setState(() => _pick(e.id)),
                    child: Container(
                      width: 88,
                      clipBehavior: Clip.antiAlias,
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(LumioRadius.md),
                        border: Border.all(
                          color: selected ? LumioColors.accent : LumioColors.border,
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Stack(
                        fit: StackFit.expand,
                        children: [
                          EffectSwatch(effect: e, height: 74),
                          Align(
                            alignment: Alignment.bottomLeft,
                            child: Padding(
                              padding: const EdgeInsets.all(6),
                              child: Text(
                                e.name,
                                style: text.bodySmall?.copyWith(color: LumioColors.text, fontWeight: FontWeight.w600),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: LumioSpace.lg),
            Wrap(
              spacing: LumioSpace.sm,
              runSpacing: LumioSpace.sm,
              children: [
                for (final p in engine.peers)
                  ChoiceChip(
                    avatar: StatusDot(color: p.online ? LumioColors.online : LumioColors.offline, size: 7),
                    label: Text(p.name),
                    selected: p.deviceId == _deviceId,
                    onSelected: (_) => setState(() => _deviceId = p.deviceId),
                  ),
              ],
            ),
            const SizedBox(height: LumioSpace.md),
            _labeled(
              context,
              'Duration',
              '${(_duration / 1000).toStringAsFixed(1)}s',
              Slider(
                value: _duration,
                min: effect.minDuration.toDouble(),
                max: effect.maxDuration.toDouble(),
                divisions: ((effect.maxDuration - effect.minDuration) / 500).round(),
                onChanged: (v) => setState(() => _duration = v),
              ),
            ),
            _labeled(
              context,
              'Intensity',
              '${(_intensity * 100).round()}%',
              Slider(value: _intensity, divisions: 20, onChanged: (v) => setState(() => _intensity = v)),
            ),
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: Text(effect.hasSound ? 'Sound' : 'Sound (not available)', style: text.bodyMedium),
              value: _haptics && effect.hasSound,
              onChanged: effect.hasSound ? (v) => setState(() => _haptics = v) : null,
            ),
            if (target != null && !target.online)
              Text(
                '${target.name} is offline. Effects only play on devices with Lumio open.',
                style: const TextStyle(color: LumioColors.warning),
              ),
            if (_error != null) Text(_error!, style: const TextStyle(color: LumioColors.danger)),
            if (status != null) ...[
              const SizedBox(height: LumioSpace.md),
              _Progress(status: status, detail: delivery?.detail),
            ],
            const SizedBox(height: LumioSpace.lg),
            FilledButton.icon(
              onPressed: target == null || !target.online || !engine.isOnline || inFlight ? null : _send,
              icon: const Icon(Icons.send_rounded, size: 18),
              label: Text(target == null ? 'Choose a device' : 'Send to ${target.name}'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _labeled(BuildContext context, String label, String value, Widget slider) {
    final text = Theme.of(context).textTheme;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Expanded(child: Text(label, style: text.bodySmall)),
            Text(value, style: text.bodyMedium),
          ],
        ),
        slider,
      ],
    );
  }
}

class _Progress extends StatelessWidget {
  const _Progress({required this.status, this.detail});
  final String status;
  final String? detail;

  @override
  Widget build(BuildContext context) {
    if (const {'failed', 'receiver_offline', 'expired', 'rejected'}.contains(status)) {
      return Text(
        status == 'receiver_offline'
            ? 'The device is offline.'
            : 'Not shown${detail != null ? ': ${detail!.replaceAll('_', ' ')}' : ''}.',
        style: const TextStyle(color: LumioColors.danger),
      );
    }
    final current = _steps.indexWhere((s) => s.$1 == status);
    return Row(
      children: [
        for (final (i, (_, label)) in _steps.indexed)
          Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 2),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AnimatedContainer(
                    duration: LumioMotion.slow,
                    height: 4,
                    decoration: BoxDecoration(
                      color: i <= current ? LumioColors.accent : LumioColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: TextStyle(fontSize: 11, color: i <= current ? LumioColors.text : LumioColors.textFaint),
                  ),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Keeps `LumioConnection` reachable for widgets importing only this file.
typedef Connection = LumioConnection;
