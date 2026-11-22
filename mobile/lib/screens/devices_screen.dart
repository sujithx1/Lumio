import 'package:flutter/material.dart';

import '../app.dart';
import '../core/api.dart';
import '../theme/tokens.g.dart';
import '../widgets/common.dart';
import '../widgets/effect_picker.dart';

class DevicesScreen extends StatelessWidget {
  const DevicesScreen({super.key, required this.onPair, this.onChangeServer});
  final VoidCallback onPair;
  final Future<void> Function(String url)? onChangeServer;

  Future<void> _rename(BuildContext context) async {
    final engine = LumioScope.read(context);
    final name = await _prompt(context, 'Rename this device', engine.me?.name ?? '', maxLength: 64);
    if (name == null || name.trim().isEmpty || !context.mounted) return;
    try {
      await engine.rename(name);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _server(BuildContext context) async {
    final engine = LumioScope.read(context);
    final url = await _prompt(context, 'Relay server', engine.api.baseUrl, keyboard: TextInputType.url);
    if (url == null || !context.mounted) return;
    final uri = Uri.tryParse(url.trim());
    if (uri == null || !(uri.scheme == 'http' || uri.scheme == 'https') || uri.host.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter a URL like https://relay.example.com')));
      return;
    }
    await onChangeServer?.call(uri.toString());
  }

  Future<void> _remove(BuildContext context, PeerRecord p) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (c) => AlertDialog(
        title: Text('Remove ${p.name}?'),
        content: const Text('Neither device will be able to send effects to the other until you pair them again.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c, false), child: const Text('Cancel')),
          TextButton(
            onPressed: () => Navigator.pop(c, true),
            style: TextButton.styleFrom(foregroundColor: LumioColors.danger),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    try {
      await LumioScope.read(context).unpair(p.deviceId);
    } catch (e) {
      if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final text = Theme.of(context).textTheme;
    final (color, label) = connectionLook(engine.connection);
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.fromLTRB(LumioSpace.xl, LumioSpace.lg, LumioSpace.xl, LumioSpace.xxxl),
        children: [
          Text('Devices', style: text.headlineMedium),
          const SizedBox(height: LumioSpace.xxl),
          const SectionTitle('This device'),
          Card(
            child: Column(
              children: [
                ListTile(
                  title: Text(engine.me?.name ?? engine.api.device.name),
                  subtitle: Row(
                    children: [
                      StatusDot(color: color, size: 7),
                      const SizedBox(width: 8),
                      Flexible(
                        child: Text(label, style: text.bodySmall, overflow: TextOverflow.ellipsis),
                      ),
                    ],
                  ),
                  trailing: TextButton(
                    onPressed: engine.isOnline ? () => _rename(context) : null,
                    child: const Text('Rename'),
                  ),
                ),
                const Divider(height: 1),
                ListTile(
                  dense: true,
                  title: const Text('Relay server'),
                  subtitle: Text(engine.api.baseUrl, style: text.bodySmall),
                  trailing: onChangeServer == null ? null : const Icon(Icons.edit_outlined, size: 18),
                  onTap: onChangeServer == null ? null : () => _server(context),
                ),
                if (engine.connectionDetail != null && !engine.isOnline)
                  ListTile(
                    dense: true,
                    title: const Text('Status'),
                    subtitle: Text(engine.connectionDetail!, style: text.bodySmall),
                  ),
              ],
            ),
          ),
          const SizedBox(height: LumioSpace.xxl),
          const SectionTitle('Files'),
          const FileSettingsCard(),
          const SizedBox(height: LumioSpace.xxl),
          SectionTitle(
            'Paired devices${engine.peers.isEmpty ? '' : ' · ${engine.peers.length}'}',
            trailing: TextButton.icon(
              onPressed: engine.isOnline ? onPair : null,
              icon: const Icon(Icons.add_link_rounded, size: 18),
              label: const Text('Pair'),
            ),
          ),
          if (engine.peers.isEmpty)
            const EmptyCard(
              icon: Icons.devices_rounded,
              title: 'No paired devices',
              body: 'Paired devices appear here with their live status.',
            )
          else
            Card(
              child: Column(
                children: [
                  for (final p in engine.peers)
                    ListTile(
                      leading: Icon(platformIcon(p.platform)),
                      title: Text(p.name, overflow: TextOverflow.ellipsis),
                      subtitle: Text(
                        '${platformLabels[p.platform] ?? p.platform} · ${p.online
                            ? 'Online via relay'
                            : p.lastSeenAt != null
                            ? 'Last seen ${timeAgo(p.lastSeenAt!)}'
                            : 'Never seen'}',
                        style: text.bodySmall,
                      ),
                      trailing: IconButton(
                        icon: const Icon(Icons.delete_outline_rounded),
                        tooltip: 'Remove',
                        onPressed: () => _remove(context, p),
                      ),
                    ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}

Future<String?> _prompt(BuildContext context, String title, String initial, {int? maxLength, TextInputType? keyboard}) {
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (c) => AlertDialog(
      title: Text(title),
      content: TextField(
        controller: controller,
        autofocus: true,
        maxLength: maxLength,
        keyboardType: keyboard,
        autocorrect: false,
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(c), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.pop(c, controller.text), child: const Text('Save')),
      ],
    ),
  ).whenComplete(controller.dispose);
}

/// Which effect plays when this phone sends files, and where received files go.
class FileSettingsCard extends StatelessWidget {
  const FileSettingsCard({super.key});

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final settings = engine.settings;
    final text = Theme.of(context).textTheme;
    return ListenableBuilder(
      listenable: settings,
      builder: (context, _) {
        final effect = engine.catalog.byId(settings.fileEffectId) ?? engine.catalog.effects.first;
        return Card(
          child: Column(
            children: [
              ListTile(
                leading: ClipRRect(
                  borderRadius: BorderRadius.circular(LumioRadius.sm),
                  child: SizedBox(width: 40, height: 40, child: EffectSwatch(effect: effect, height: 40)),
                ),
                title: const Text('Effect when you send files'),
                subtitle: Text(effect.name, style: text.bodySmall),
                trailing: const Icon(Icons.chevron_right_rounded),
                onTap: () async {
                  final id = await pickEffect(
                    context,
                    engine.catalog,
                    current: settings.fileEffectId,
                    title: 'Effect when you send files',
                  );
                  if (id != null) settings.fileEffectId = id;
                },
              ),
              const Divider(height: 1),
              SwitchListTile(
                title: const Text('Save photos & videos to Photos'),
                subtitle: Text('Received pictures and videos also appear in your library.', style: text.bodySmall),
                value: settings.savePhotos,
                onChanged: (v) => settings.savePhotos = v,
              ),
              const Divider(height: 1),
              ListTile(
                dense: true,
                leading: const Icon(Icons.folder_outlined),
                title: const Text('Received files'),
                subtitle: Text('Files app › On My iPhone › Lumio › Received', style: text.bodySmall),
              ),
            ],
          ),
        );
      },
    );
  }
}
