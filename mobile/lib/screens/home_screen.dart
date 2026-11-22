import 'dart:io' show Platform;

import 'package:flutter/material.dart';

import '../app.dart';
import '../theme/tokens.g.dart';
import '../widgets/common.dart';
import '../widgets/send_files_sheet.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.onPair, required this.onSend});

  final VoidCallback onPair;
  final void Function({String? effectId, String? deviceId}) onSend;

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final text = Theme.of(context).textTheme;
    final peers = engine.peers;
    final (color, label) = connectionLook(engine.connection);

    return SafeArea(
      child: RefreshIndicator(
        onRefresh: () async {
          engine.reconnectNow();
          await Future.wait([engine.refreshPeers().catchError((_) {}), engine.refreshRecent()]);
        },
        child: ListView(
          padding: const EdgeInsets.fromLTRB(LumioSpace.xl, LumioSpace.lg, LumioSpace.xl, LumioSpace.xxxl),
          children: [
            Row(
              children: [
                Expanded(child: Text('Lumio', style: text.headlineMedium)),
                IconButton.filledTonal(
                  onPressed: engine.isOnline ? onPair : null,
                  icon: const Icon(Icons.add_link_rounded),
                  tooltip: 'Pair device',
                ),
              ],
            ),
            const SizedBox(height: LumioSpace.xl),
            Container(
              padding: const EdgeInsets.all(LumioSpace.xl),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(LumioRadius.xl),
                border: Border.all(color: LumioColors.border),
                gradient: RadialGradient(
                  center: const Alignment(0.9, -1.2),
                  radius: 1.4,
                  colors: [LumioColors.accent.withValues(alpha: 0.35), LumioColors.surface],
                ),
              ),
              child: Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: LumioColors.surfaceRaised,
                      borderRadius: BorderRadius.circular(LumioRadius.md),
                      border: Border.all(color: LumioColors.border),
                    ),
                    child: Icon(
                      Platform.isIOS || Platform.isAndroid ? Icons.smartphone_rounded : Icons.devices_rounded,
                    ),
                  ),
                  const SizedBox(width: LumioSpace.lg),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('THIS DEVICE', style: text.labelSmall),
                        const SizedBox(height: 2),
                        Text(
                          engine.me?.name ?? engine.api.device.name,
                          style: text.titleMedium,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: LumioSpace.xs),
                        Row(
                          children: [
                            StatusDot(color: color, size: 7),
                            const SizedBox(width: LumioSpace.sm),
                            Flexible(child: Text(label, style: text.bodySmall)),
                          ],
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: LumioSpace.xxl),
            const SectionTitle('Your devices'),
            if (peers.isEmpty)
              EmptyCard(
                icon: Icons.link_rounded,
                title: 'No paired devices yet',
                body: 'Scan the QR code shown on your computer, or show a code here for another phone.',
                action: FilledButton.icon(
                  onPressed: engine.isOnline ? onPair : null,
                  icon: const Icon(Icons.qr_code_scanner_rounded),
                  label: const Text('Pair a device'),
                ),
              )
            else
              for (final p in peers)
                Padding(
                  padding: const EdgeInsets.only(bottom: LumioSpace.sm),
                  child: Card(
                    child: ListTile(
                      contentPadding: const EdgeInsets.symmetric(horizontal: LumioSpace.lg, vertical: LumioSpace.xs),
                      leading: Stack(
                        clipBehavior: Clip.none,
                        children: [
                          Icon(platformIcon(p.platform), size: 26),
                          Positioned(
                            right: -2,
                            bottom: -2,
                            child: StatusDot(color: p.online ? LumioColors.online : LumioColors.offline, size: 8),
                          ),
                        ],
                      ),
                      title: Text(p.name, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${platformLabels[p.platform] ?? p.platform} · ${p.online
                            ? 'Online'
                            : p.lastSeenAt != null
                            ? 'Seen ${timeAgo(p.lastSeenAt!)}'
                            : 'Offline'}',
                        style: text.bodySmall,
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            onPressed: p.online && engine.isOnline ? () => startSendFiles(context, p.deviceId) : null,
                            icon: const Icon(Icons.attach_file_rounded),
                            tooltip: 'Send files',
                          ),
                          FilledButton.tonal(
                            onPressed: p.online ? () => onSend(deviceId: p.deviceId) : null,
                            child: const Text('Send'),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
            const SizedBox(height: LumioSpace.xxl),
            const SectionTitle('Quick effects'),
            SizedBox(
              height: 128,
              child: ListView.separated(
                scrollDirection: Axis.horizontal,
                itemCount: engine.catalog.effects.length,
                separatorBuilder: (_, _) => const SizedBox(width: LumioSpace.md),
                itemBuilder: (_, i) {
                  final e = engine.catalog.effects[i];
                  return SizedBox(
                    width: 120,
                    child: Card(
                      clipBehavior: Clip.antiAlias,
                      child: InkWell(
                        onTap: peers.isEmpty ? null : () => onSend(effectId: e.id),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            EffectSwatch(effect: e, height: 84),
                            Padding(
                              padding: const EdgeInsets.all(LumioSpace.sm),
                              child: Text(
                                e.name,
                                style: text.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
            const SizedBox(height: LumioSpace.xxl),
            const SectionTitle('Recent effects'),
            if (engine.recent.isEmpty)
              const EmptyCard(
                icon: Icons.history_rounded,
                title: 'Nothing yet',
                body: 'Effects you send and receive show up here.',
              )
            else
              Card(
                child: Column(
                  children: [
                    for (final r in engine.recent.take(8))
                      ListTile(
                        dense: true,
                        leading: Icon(
                          r.direction == 'sent' ? Icons.north_east_rounded : Icons.south_west_rounded,
                          color: r.direction == 'sent' ? LumioColors.accent : LumioColors.accentAlt,
                          size: 18,
                        ),
                        title: Text(
                          '${engine.catalog.byId(r.effectId)?.name ?? r.effectId} ${r.direction == 'sent' ? 'to' : 'from'} ${r.peerName}',
                          overflow: TextOverflow.ellipsis,
                        ),
                        trailing: Text(timeAgo(r.at), style: text.bodySmall),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
