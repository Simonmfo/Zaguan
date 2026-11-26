import 'package:flutter/material.dart';

import '../models/zaguan_models.dart';
import '../state/zaguan_store.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.store});

  final ZaguanStore store;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _emailCtrl = TextEditingController(text: 'instalador@zaguan.uy');
  final _passCtrl = TextEditingController(text: 'zaguan2026');
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  void _submit() {
    final user = widget.store.login(_emailCtrl.text, _passCtrl.text);
    if (user == null) {
      setState(() {
        _error = 'Credenciales inválidas o usuario dado de baja.';
      });
    }
  }

  void _quickLogin(AppUser user) {
    _emailCtrl.text = user.email;
    _passCtrl.text = user.password;
    final logged = widget.store.login(user.email, user.password);
    if (logged == null) {
      setState(() => _error = 'Este usuario fue dado de baja.');
    }
  }

  IconData _iconForRole(ZaguanRole role) => switch (role) {
        ZaguanRole.installer => Icons.engineering,
        ZaguanRole.buildingAdmin => Icons.admin_panel_settings,
        ZaguanRole.owner => Icons.home_work,
        ZaguanRole.tenant => Icons.person,
      };

  Color _colorForRole(ZaguanRole role) => switch (role) {
        ZaguanRole.installer => const Color(0xFF002547),
        ZaguanRole.buildingAdmin => const Color(0xFF076C41),
        ZaguanRole.owner => const Color(0xFF103B66),
        ZaguanRole.tenant => const Color(0xFF0F766E),
      };

  @override
  Widget build(BuildContext context) {
    final activeUsers = widget.store.users.where((u) => u.isActive).toList();

    return Scaffold(
      backgroundColor: const Color(0xFFF2F4F6),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 8),
                  Center(
                    child: Container(
                      width: 64,
                      height: 64,
                      decoration: BoxDecoration(
                        color: const Color(0xFF002547),
                        borderRadius: BorderRadius.circular(18),
                      ),
                      child: const Icon(
                        Icons.shield_outlined,
                        color: Colors.white,
                        size: 36,
                      ),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Zaguán Digital',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontSize: 26,
                      fontWeight: FontWeight.w800,
                      color: Color(0xFF191C1E),
                    ),
                  ),
                  const SizedBox(height: 4),
                  const Text(
                    'App Nativa 100% Dart · Portería Inteligente Akuvox E12W',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: Color(0xFF43474F)),
                  ),
                  const SizedBox(height: 20),

                  // Formulario de Login
                  Card(
                    elevation: 0,
                    color: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: const BorderSide(color: Color(0xFFC3C6D0)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          const Text(
                            'Iniciar sesión',
                            style: TextStyle(
                              fontSize: 18,
                              fontWeight: FontWeight.w700,
                              color: Color(0xFF191C1E),
                            ),
                          ),
                          const SizedBox(height: 14),
                          TextField(
                            controller: _emailCtrl,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                              labelText: 'Correo electrónico',
                              prefixIcon: Icon(Icons.email_outlined),
                              border: OutlineInputBorder(),
                            ),
                          ),
                          const SizedBox(height: 12),
                          TextField(
                            controller: _passCtrl,
                            obscureText: _obscure,
                            decoration: InputDecoration(
                              labelText: 'Contraseña',
                              prefixIcon: const Icon(Icons.lock_outline),
                              border: const OutlineInputBorder(),
                              suffixIcon: IconButton(
                                onPressed: () => setState(() => _obscure = !_obscure),
                                icon: Icon(
                                  _obscure ? Icons.visibility : Icons.visibility_off,
                                ),
                              ),
                            ),
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 10),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFDAD6),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _error!,
                                style: const TextStyle(
                                  color: Color(0xFF93000A),
                                  fontWeight: FontWeight.w600,
                                  fontSize: 13,
                                ),
                              ),
                            ),
                          ],
                          const SizedBox(height: 16),
                          FilledButton(
                            onPressed: _submit,
                            style: FilledButton.styleFrom(
                              backgroundColor: const Color(0xFF002547),
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(10),
                              ),
                            ),
                            child: const Text(
                              'Ingresar a Zaguán',
                              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),

                  // Accesos rápidos de prueba (1 por rol + nuevos usuarios creados por el Instalador)
                  Card(
                    elevation: 0,
                    color: Colors.white,
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                      side: const BorderSide(color: Color(0xFFC3C6D0)),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Wrap(
                            spacing: 8,
                            runSpacing: 4,
                            alignment: WrapAlignment.spaceBetween,
                            crossAxisAlignment: WrapCrossAlignment.center,
                            children: [
                              Text(
                                'Usuarios de prueba (1 toque)',
                                style: TextStyle(
                                  fontWeight: FontWeight.w700,
                                  fontSize: 14,
                                  color: Color(0xFF191C1E),
                                ),
                              ),
                              Text(
                                'Clave: zaguan2026',
                                style: TextStyle(
                                  fontFamily: 'monospace',
                                  fontSize: 11,
                                  color: Color(0xFF002547),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          ...activeUsers.map((u) {
                            final roleColor = _colorForRole(u.role);
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: InkWell(
                                borderRadius: BorderRadius.circular(10),
                                onTap: () => _quickLogin(u),
                                child: Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                    color: const Color(0xFFF7F9FB),
                                    borderRadius: BorderRadius.circular(10),
                                    border: Border.all(color: const Color(0xFFD8DADC)),
                                  ),
                                  child: Row(
                                    children: [
                                      CircleAvatar(
                                        backgroundColor: roleColor,
                                        foregroundColor: Colors.white,
                                        child: Icon(_iconForRole(u.role), size: 20),
                                      ),
                                      const SizedBox(width: 12),
                                      Expanded(
                                        child: Column(
                                          crossAxisAlignment: CrossAxisAlignment.start,
                                          children: [
                                            Row(
                                              children: [
                                                Text(
                                                  u.role.label,
                                                  style: TextStyle(
                                                    fontWeight: FontWeight.w700,
                                                    color: roleColor,
                                                    fontSize: 13,
                                                  ),
                                                ),
                                                if (u.unit != null) ...[
                                                  const SizedBox(width: 6),
                                                  Text(
                                                    'Apto ${u.unit}',
                                                    style: const TextStyle(
                                                      fontFamily: 'monospace',
                                                      fontSize: 11,
                                                      color: Color(0xFF076C41),
                                                    ),
                                                  ),
                                                ],
                                              ],
                                            ),
                                            Text(
                                              '${u.fullName} · ${u.email}',
                                              style: const TextStyle(
                                                fontSize: 12,
                                                color: Color(0xFF43474F),
                                              ),
                                              overflow: TextOverflow.ellipsis,
                                            ),
                                          ],
                                        ),
                                      ),
                                      const Icon(Icons.arrow_forward_ios,
                                          size: 14, color: Color(0xFF737780)),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          }),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
