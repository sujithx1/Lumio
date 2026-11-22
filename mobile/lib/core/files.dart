// File-sharing helpers: safe names, hashing, sizes, and where received files live.
import 'dart:async';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:gal/gal.dart';
import 'package:path_provider/path_provider.dart';

import '../protocol/message.dart' show isFileName;

/// A file chosen to send: a local path plus the name to show the receiver.
class PickedFile {
  const PickedFile({required this.path, required this.name, required this.size});
  final String path;
  final String name;
  final int size;
}

/// Where received files are written, and how they reach the Photos library.
abstract interface class FileHost {
  /// The folder received files are saved to. Created on demand.
  Future<Directory> receivedDirectory();

  /// Adds a received photo or video to the system photo library.
  Future<void> saveToPhotos(File file, {required bool video});
}

/// Documents/Received, which the Files app shows as On My iPhone › Lumio › Received.
class DeviceFileHost implements FileHost {
  const DeviceFileHost();

  @override
  Future<Directory> receivedDirectory() async {
    final docs = await getApplicationDocumentsDirectory();
    return Directory('${docs.path}/Received').create(recursive: true);
  }

  @override
  Future<void> saveToPhotos(File file, {required bool video}) async {
    if (!await Gal.hasPermission() && !await Gal.requestPermission()) {
      throw StateError('Lumio is not allowed to add to Photos.');
    }
    video ? await Gal.putVideo(file.path) : await Gal.putImage(file.path);
  }
}

/// A [FileHost] rooted in a given folder, with Photos saves recorded instead of performed (tests).
class DirectoryFileHost implements FileHost {
  DirectoryFileHost(this.root);
  final Directory root;
  final List<String> photos = [];

  @override
  Future<Directory> receivedDirectory() => Directory('${root.path}/Received').create(recursive: true);

  @override
  Future<void> saveToPhotos(File file, {required bool video}) async => photos.add(file.path);
}

const _maxNameLength = 120;

/// Makes a name from another device safe to use as a file name on this one.
/// Drops any path, control and reserved characters and leading dots; keeps the extension; never empty.
String sanitizeFileName(String raw) {
  var name = raw.split(RegExp(r'[/\\]')).last;
  name = name.replaceAll(RegExp(r'[\u0000-\u001f\u007f:*?"<>|]'), '').trim();
  name = name.replaceFirst(RegExp(r'^[.\s]+'), '');
  if (name.runes.length > _maxNameLength) {
    final dot = name.lastIndexOf('.');
    final ext = dot > 0 && name.length - dot <= 12 ? name.substring(dot) : '';
    final stem = String.fromCharCodes(name.substring(0, name.length - ext.length).runes.take(_maxNameLength - ext.length));
    name = '${stem.trimRight()}$ext';
  }
  if (name.isEmpty || !isFileName(name)) return 'file';
  return name;
}

/// `name`, or `name (1).ext`, `name (2).ext`, … — the first that does not exist in [dir].
String uniqueFileName(Directory dir, String name) {
  if (!File('${dir.path}/$name').existsSync()) return name;
  final dot = name.lastIndexOf('.');
  final stem = dot > 0 ? name.substring(0, dot) : name;
  final ext = dot > 0 ? name.substring(dot) : '';
  for (var i = 1; ; i++) {
    final candidate = '$stem ($i)$ext';
    if (!File('${dir.path}/$candidate').existsSync()) return candidate;
  }
}

/// SHA-256 of a file, read in chunks (never the whole file in memory). Lowercase hex.
Future<String> sha256OfFile(File file) async => (await sha256.bind(file.openRead()).first).toString();

/// Incremental SHA-256 for bytes as they stream past.
class StreamingSha256 {
  StreamingSha256() {
    _input = sha256.startChunkedConversion(_sink);
  }
  final _sink = _DigestSink();
  late final Sink<List<int>> _input;

  void add(List<int> chunk) => _input.add(chunk);

  /// Finishes the hash. Call once.
  String close() {
    _input.close();
    return _sink.value.toString();
  }
}

class _DigestSink implements Sink<Digest> {
  late Digest value;
  @override
  void add(Digest data) => value = data;
  @override
  void close() {}
}

const _imageExt = {'jpg', 'jpeg', 'png', 'gif', 'heic', 'heif', 'webp', 'bmp', 'tif', 'tiff', 'dng'};
const _videoExt = {'mov', 'mp4', 'm4v', '3gp', 'avi', 'mkv', 'webm', 'hevc'};

String _ext(String name) {
  final dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.substring(dot + 1).toLowerCase();
}

bool isImageName(String name) => _imageExt.contains(_ext(name));
bool isVideoName(String name) => _videoExt.contains(_ext(name));

/// MIME type from the extension. Only informative: receivers decide by their own rules.
String mimeForName(String name) => switch (_ext(name)) {
  'jpg' || 'jpeg' => 'image/jpeg',
  'png' => 'image/png',
  'gif' => 'image/gif',
  'heic' => 'image/heic',
  'heif' => 'image/heif',
  'webp' => 'image/webp',
  'mov' => 'video/quicktime',
  'mp4' || 'm4v' => 'video/mp4',
  'pdf' => 'application/pdf',
  'txt' => 'text/plain',
  'md' => 'text/markdown',
  'csv' => 'text/csv',
  'json' => 'application/json',
  'zip' => 'application/zip',
  'mp3' => 'audio/mpeg',
  'm4a' => 'audio/mp4',
  'wav' => 'audio/wav',
  'doc' => 'application/msword',
  'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'key' => 'application/vnd.apple.keynote',
  'pages' => 'application/vnd.apple.pages',
  _ => 'application/octet-stream',
};

/// "1.4 MB" style sizes.
String formatBytes(int bytes) {
  if (bytes < 1024) return '$bytes B';
  const units = ['KB', 'MB', 'GB', 'TB'];
  var value = bytes / 1024;
  var unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return '${value >= 10 ? value.toStringAsFixed(0) : value.toStringAsFixed(1)} ${units[unit]}';
}
