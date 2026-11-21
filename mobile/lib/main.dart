import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'app.dart';
import 'core/api.dart';
import 'core/engine.dart';
import 'core/identity.dart';
import 'effects/catalog.dart';
import 'effects/renderers.dart';

/// Default relay. Override at build time with --dart-define=SYNQ_SERVER_URL=https://…
/// (the Android emulator reaches the host machine at http://10.0.2.2:8787), or in the app under Devices.
const _defaultServer = String.fromEnvironment('SYNQ_SERVER_URL', defaultValue: 'http://localhost:8787');
const _serverKey = 'synq.server';
const _appVersion = '0.1.0';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle.light);
  final store = DeviceSecureStore();
  final catalog = await EffectCatalog.load();
  final identity = await Identity.loadOrCreate(store);
  final server = await store.read(_serverKey) ?? _defaultServer;
  runApp(SynqRoot(store: store, catalog: catalog, identity: identity, server: server));
  WidgetsBinding.instance.addPostFrameCallback((_) => warmUpShaders());
}

/// Owns the engine; swapping relay servers rebuilds it with the same identity.
class SynqRoot extends StatefulWidget {
  const SynqRoot({super.key, required this.store, required this.catalog, required this.identity, required this.server});
  final SecureStore store;
  final EffectCatalog catalog;
  final Identity identity;
  final String server;

  @override
  State<SynqRoot> createState() => _SynqRootState();
}

class _SynqRootState extends State<SynqRoot> {
  late SynqEngine _engine = _create(widget.server);

  SynqEngine _create(String server) {
    final api = ApiClient(
      baseUrl: server,
      identity: widget.identity,
      device: DeviceInfo(
        name: Platform.isIOS ? 'My iPhone' : 'My Android phone',
        platform: Platform.isIOS ? 'ios' : 'android',
        appVersion: _appVersion,
      ),
    );
    return SynqEngine(api: api, identity: widget.identity, catalog: widget.catalog)..start();
  }

  Future<void> _changeServer(String url) async {
    await widget.store.write(_serverKey, url);
    final old = _engine;
    setState(() => _engine = _create(url));
    WidgetsBinding.instance.addPostFrameCallback((_) => old.dispose());
  }

  @override
  void dispose() {
    _engine.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      SynqApp(key: ObjectKey(_engine), engine: _engine, onChangeServer: _changeServer);
}
