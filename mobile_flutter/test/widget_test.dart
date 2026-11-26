import 'package:flutter_test/flutter_test.dart';
import 'package:zaguan_app/main.dart';

void main() {
  testWidgets('Zaguán opens on LoginScreen with 4 test accounts', (WidgetTester tester) async {
    await tester.pumpWidget(const ZaguanApp());

    expect(find.text('Zaguán Digital'), findsOneWidget);
    expect(find.text('Iniciar sesión'), findsOneWidget);
    expect(find.text('Instalador'), findsOneWidget);
    expect(find.text('Administrador'), findsOneWidget);
    expect(find.text('Propietario'), findsOneWidget);
    expect(find.text('Inquilino'), findsOneWidget);
  });
}
