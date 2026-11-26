import 'package:flutter/material.dart';

import 'models/zaguan_models.dart';
import 'screens/admin_shell.dart';
import 'screens/installer_shell.dart';
import 'screens/login_screen.dart';
import 'screens/resident_shell.dart';
import 'state/zaguan_store.dart';

void main() {
  runApp(const ZaguanApp());
}

class ZaguanApp extends StatefulWidget {
  const ZaguanApp({super.key});

  @override
  State<ZaguanApp> createState() => _ZaguanAppState();
}

class _ZaguanAppState extends State<ZaguanApp> {
  final ZaguanStore _store = ZaguanStore();

  @override
  void dispose() {
    _store.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Zaguán Digital',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF002547),
          primary: const Color(0xFF002547),
          secondary: const Color(0xFF076C41),
          surface: const Color(0xFFF7F9FB),
        ),
        scaffoldBackgroundColor: const Color(0xFFF2F4F6),
        cardTheme: CardThemeData(
          elevation: 0,
          color: Colors.white,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
            side: const BorderSide(color: Color(0xFFD8DADC)),
          ),
        ),
      ),
      home: AnimatedBuilder(
        animation: _store,
        builder: (context, _) {
          final user = _store.currentUser;
          if (user == null) {
            return LoginScreen(store: _store);
          }
          return switch (user.role) {
            ZaguanRole.installer => InstallerShell(store: _store),
            ZaguanRole.buildingAdmin => AdminShell(store: _store),
            ZaguanRole.owner || ZaguanRole.tenant => ResidentShell(store: _store),
          };
        },
      ),
    );
  }
}
