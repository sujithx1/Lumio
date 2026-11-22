import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../app.dart';
import '../core/engine.dart';
import '../core/files.dart';
import '../theme/tokens.g.dart';
import 'effect_picker.dart';
import 'flick_card.dart';

enum FileSource { media, files }

/// Asks what to send, opens the system picker, then shows [SendFilesSheet].
Future<void> startSendFiles(BuildContext context, String deviceId) async {
  final source = await showModalBottomSheet<FileSource>(
    context: context,
    showDragHandle: true,
    builder: (c) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          ListTile(
            leading: const Icon(Icons.photo_library_outlined),
            title: const Text('Photos & videos'),
            onTap: () => Navigator.pop(c, FileSource.media),
          ),
          ListTile(
            leading: const Icon(Icons.folder_outlined),
            title: const Text('Files'),
            subtitle: const Text('Documents, PDFs, zips and more'),
            onTap: () => Navigator.pop(c, FileSource.files),
          ),
          const SizedBox(height: LumioSpace.md),
        ],
      ),
    ),
  );
  if (source == null || !context.mounted) return;

  final List<PlatformFile> chosen;
  try {
    chosen = await FilePicker.pickFiles(
      type: source == FileSource.media ? FileType.media : FileType.any,
      // Photos arrive as JPEG/MP4 so any computer can open them.
      darwinOptions: const DarwinOptions(assetRepresentationMode: DarwinAssetRepresentationMode.compatible),
    );
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text("Couldn't open the picker: $e")));
    }
    return;
  }
  final picked = <PickedFile>[];
  for (final f in chosen) {
    final path = f.path;
    if (path == null) continue;
    picked.add(PickedFile(path: path, name: f.name, size: await f.length() ?? File(path).lengthSync()));
  }
  if (picked.isEmpty || !context.mounted) return;
  await showSendFilesSheet(context, deviceId, picked);
}

Future<void> showSendFilesSheet(BuildContext context, String deviceId, List<PickedFile> files) =>
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (_) => SendFilesSheet(deviceId: deviceId, files: files),
    );

/// The chosen files, the effect that will play on the other device, and a card to flick to send them.
class SendFilesSheet extends StatefulWidget {
  const SendFilesSheet({super.key, required this.deviceId, required this.files});
  final String deviceId;
  final List<PickedFile> files;

  @override
  State<SendFilesSheet> createState() => _SendFilesSheetState();
}

class _SendFilesSheetState extends State<SendFilesSheet> {
  String? _effectId;
  List<String>? _ids;

  void _send() {
    final engine = LumioScope.read(context);
    setState(() => _ids = engine.sendFiles(widget.deviceId, widget.files, effectId: _effectId));
  }

  Future<void> _changeEffect() async {
    final engine = LumioScope.read(context);
    final id = await pickEffect(
      context,
      engine.catalog,
      current: _effectId ?? engine.settings.fileEffectId,
      title: 'Effect for these files',
    );
    if (id != null) setState(() => _effectId = id);
  }

  @override
  Widget build(BuildContext context) {
    final engine = LumioScope.of(context);
    final text = Theme.of(context).textTheme;
    final effect =
        engine.catalog.byId(_effectId ?? engine.settings.fileEffectId) ?? engine.catalog.effects.first;
    final target = engine.peers.where((p) => p.deviceId == widget.deviceId).firstOrNull;
    final total = widget.files.fold<int>(0, (sum, f) => sum + f.size);
    final sending = [for (final id in _ids ?? const <String>[]) ?engine.outgoing[id]];
    final allDone = sending.isNotEmpty && sending.every((f) => f.finished);
    final delivered = sending.where((f) => f.status == OutgoingFileStatus.delivered).length;
    final count = widget.files.length;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(LumioSpace.xl, 0, LumioSpace.xl, LumioSpace.xl),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Send to ${target?.name ?? 'device'}',
              style: text.titleLarge?.copyWith(fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 2),
            Text('$count ${count == 1 ? 'file' : 'files'} · ${formatBytes(total)}', style: text.bodySmall),
            const SizedBox(height: LumioSpace.md),
            ConstrainedBox(
              constraints: const BoxConstraints(maxHeight: 220),
              child: Card(
                margin: EdgeInsets.zero,
                child: ListView.separated(
                  shrinkWrap: true,
                  padding: EdgeInsets.zero,
                  itemCount: widget.files.length,
                  separatorBuilder: (_, _) => const Divider(height: 1),
                  itemBuilder: (_, i) => _FileRow(file: widget.files[i], progress: i < sending.length ? sending[i] : null),
                ),
              ),
            ),
            const SizedBox(height: LumioSpace.lg),
            if (_ids == null) ...[
              Row(
                children: [
                  Expanded(
                    child: Text('Plays on ${target?.name ?? 'the other device'}', style: text.bodySmall),
                  ),
                  TextButton(onPressed: _changeEffect, child: const Text('Change effect')),
                ],
              ),
              FlickCard(
                effect: effect,
                enabled: target != null && target.online && engine.isOnline,
                hint: target == null
                    ? 'This device is no longer paired'
                    : !target.online
                    ? '${target.name} is offline'
                    : 'Reconnecting…',
                onFlick: _send,
              ),
              const SizedBox(height: LumioSpace.lg),
              FilledButton.icon(
                onPressed: target != null && target.online && engine.isOnline ? _send : null,
                icon: const Icon(Icons.send_rounded, size: 18),
                label: Text('Send $count ${count == 1 ? 'file' : 'files'}'),
              ),
            ] else ...[
              Text(
                allDone
                    ? (delivered == count
                          ? 'All delivered to ${target?.name ?? 'the device'}.'
                          : '$delivered of $count delivered.')
                    : 'Sending with ${effect.name}…',
                style: text.bodyMedium?.copyWith(
                  color: allDone && delivered < count ? LumioColors.warning : LumioColors.text,
                ),
              ),
              const SizedBox(height: LumioSpace.lg),
              FilledButton(
                onPressed: () => Navigator.of(context).pop(),
                child: Text(allDone ? 'Done' : 'Hide'),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _FileRow extends StatelessWidget {
  const _FileRow({required this.file, this.progress});
  final PickedFile file;
  final OutgoingFile? progress;

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    final p = progress;
    final icon = isImageName(file.name)
        ? Icons.image_outlined
        : isVideoName(file.name)
        ? Icons.movie_outlined
        : Icons.insert_drive_file_outlined;
    final (label, color) = switch (p?.status) {
      null => (formatBytes(file.size), LumioColors.textMuted),
      OutgoingFileStatus.waiting => ('Waiting', LumioColors.textMuted),
      OutgoingFileStatus.preparing => ('Preparing', LumioColors.textMuted),
      OutgoingFileStatus.uploading => ('${(p!.progress * 100).round()}%', LumioColors.text),
      OutgoingFileStatus.offered => ('Arriving', LumioColors.accentAlt),
      OutgoingFileStatus.delivered => ('Delivered', LumioColors.online),
      OutgoingFileStatus.failed => (p!.error ?? 'Failed', LumioColors.danger),
    };
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: LumioSpace.md, vertical: LumioSpace.sm),
      child: Row(
        children: [
          Icon(icon, size: 20, color: LumioColors.textMuted),
          const SizedBox(width: LumioSpace.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(file.name, style: text.bodyMedium, overflow: TextOverflow.ellipsis),
                if (p != null && !p.finished && p.status != OutgoingFileStatus.waiting)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: LinearProgressIndicator(
                      value: p.status == OutgoingFileStatus.preparing ? null : p.progress,
                      minHeight: 3,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: LumioSpace.md),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 150),
            child: Text(
              label,
              style: text.bodySmall?.copyWith(color: color),
              textAlign: TextAlign.end,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (p?.status == OutgoingFileStatus.delivered)
            const Padding(
              padding: EdgeInsets.only(left: 6),
              child: Icon(Icons.check_circle_rounded, size: 16, color: LumioColors.online),
            ),
        ],
      ),
    );
  }
}
