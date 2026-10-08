
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

const String appName = 'PGNT ASIAN TOPUP';

const String backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'https://pgnt-asian-backend.onrender.com',
);

const Color primaryRed = Color(0xFF7A0C10);
const Color gold = Color(0xFFD4B896);
const Color brightGold = Color(0xFFFFD700);
const Color cream = Color(0xFFFFF8E7);
const Color pageBg = Color(0xFFF8F5F0);

class AppLanguage {
  final String code;
  final String name;
  final String nativeName;

  const AppLanguage({
    required this.code,
    required this.name,
    required this.nativeName,
  });
}

const List<AppLanguage> appLanguages = [
  AppLanguage(code: 'ps', name: 'Pashto', nativeName: 'پښتو'),
  AppLanguage(code: 'fa', name: 'Dari', nativeName: 'دری'),
  AppLanguage(code: 'en', name: 'English', nativeName: 'English'),
  AppLanguage(code: 'ur', name: 'Urdu', nativeName: 'اردو'),
  AppLanguage(code: 'hi', name: 'Hindi', nativeName: 'हिन्दी'),
  AppLanguage(code: 'bn', name: 'Bengali', nativeName: 'বাংলা'),
];

class AppCountry {
  final String code;
  final String name;
  final String flag;
  final String currency;
  final String currencySymbol;

  const AppCountry({
    required this.code,
    required this.name,
    required this.flag,
    required this.currency,
    required this.currencySymbol,
  });
}

const List<AppCountry> appCountries = [
  AppCountry(
    code: 'AF',
    name: 'Afghanistan',
    flag: '🇦🇫',
    currency: 'AFN',
    currencySymbol: '؋',
  ),
  AppCountry(
    code: 'PK',
    name: 'Pakistan',
    flag: '🇵🇰',
    currency: 'PKR',
    currencySymbol: 'Rs',
  ),
  AppCountry(
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    currencySymbol: '₹',
  ),
  AppCountry(
    code: 'BD',
    name: 'Bangladesh',
    flag: '🇧🇩',
    currency: 'BDT',
    currencySymbol: '৳',
  ),
];

class PgntAppState extends ChangeNotifier {
  String languageCode = 'ps';
  AppCountry country = appCountries.first;
  String? operatorName;
  String phone = '';

  void setLanguage(String code) {
    languageCode = code;
    notifyListeners();
  }

  void setCountry(AppCountry value) {
    country = value;
    operatorName = null;
    phone = '';
    notifyListeners();
  }

  void setOperator(String? value) {
    operatorName = value;
    notifyListeners();
  }

  void setPhone(String value) {
    phone = value;
    notifyListeners();
  }
}

final PgntAppState appState = PgntAppState();

String formatEuro(int cents) {
  return '€${(cents / 100).toStringAsFixed(2)}';
}

String normalizePhone(String value) {
  return value.replaceAll(RegExp(r'[\s\-()]'), '');
}

bool validPhone(String countryCode, String value) {
  final phone = normalizePhone(value).replaceAll('+', '');

  if (!RegExp(r'^\d+$').hasMatch(phone)) return false;

  switch (countryCode) {
    case 'AF':
      return phone.length >= 9 && phone.length <= 10;
    case 'PK':
      return phone.length >= 10 && phone.length <= 11;
    case 'IN':
      return phone.length >= 10 && phone.length <= 12;
    case 'BD':
      return phone.length >= 10 && phone.length <= 11;
    default:
      return false;
  }
}

void main() {
  runApp(const PgntAsianApp());
}

class PgntAsianApp extends StatelessWidget {
  const PgntAsianApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: pageBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryRed,
          primary: primaryRed,
          secondary: gold,
          surface: Colors.white,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: primaryRed,
          foregroundColor: Colors.white,
          centerTitle: true,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: primaryRed,
            foregroundColor: Colors.white,
            minimumSize: const Size.fromHeight(50),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: gold),
          ),
        ),
      ),
      home: const PgntMainShell(),
        body: Center(
          child: CircularProgressIndicator(color: primaryRed),
        ),
      ),
    );
  }
}
class OperatorInfo {
  final String countryCode;
  final String name;
  final String logo;

  const OperatorInfo({
    required this.countryCode,
    required this.name,
    required this.logo,
  });
}

const List<OperatorInfo> operators = [
  OperatorInfo(countryCode: 'AF', name: 'Roshan', logo: '📶'),
  OperatorInfo(countryCode: 'AF', name: 'Etisalat', logo: '📱'),
  OperatorInfo(countryCode: 'AF', name: 'AWCC', logo: '📡'),
  OperatorInfo(countryCode: 'AF', name: 'Salaam', logo: '☎️'),
  OperatorInfo(countryCode: 'PK', name: 'Jazz', logo: '📶'),
  OperatorInfo(countryCode: 'PK', name: 'Zong', logo: '📱'),
  OperatorInfo(countryCode: 'PK', name: 'Ufone', logo: '📡'),
  OperatorInfo(countryCode: 'PK', name: 'Telenor', logo: '☎️'),
  OperatorInfo(countryCode: 'IN', name: 'Airtel', logo: '📶'),
  OperatorInfo(countryCode: 'IN', name: 'Jio', logo: '📱'),
  OperatorInfo(countryCode: 'IN', name: 'Vi', logo: '📡'),
  OperatorInfo(countryCode: 'BD', name: 'Grameenphone', logo: '📶'),
  OperatorInfo(countryCode: 'BD', name: 'Robi', logo: '📱'),
  OperatorInfo(countryCode: 'BD', name: 'Banglalink', logo: '📡'),
];

class TopUpProduct {
  final String id;
  final String countryCode;
  final String operatorName;
  final String name;
  final String currency;
  final int recipientAmount;
  final int priceEurCents;
  final int bonusAmount;

  const TopUpProduct({
    required this.id,
    required this.countryCode,
    required this.operatorName,
    required this.name,
    required this.currency,
    required this.recipientAmount,
    required this.priceEurCents,
    this.bonusAmount = 0,
  });

  factory TopUpProduct.fromJson(Map<String, dynamic> json) {
    return TopUpProduct(
      id: '${json['id'] ?? json['product_id'] ?? ''}',
      countryCode: '${json['country_code'] ?? ''}',
      operatorName: '${json['operator_name'] ?? ''}',
      name: '${json['name'] ?? json['product_name'] ?? ''}',
      currency: '${json['currency'] ?? ''}',
      recipientAmount:
          int.tryParse('${json['recipient_amount'] ?? 0}') ?? 0,
      priceEurCents:
          int.tryParse('${json['price_eur_cents'] ?? 0}') ?? 0,
      bonusAmount:
          int.tryParse('${json['bonus_amount'] ?? 0}') ?? 0,
    );
  }
}

class PgntOrder {
  final String id;
  final String status;
  final String? checkoutUrl;

  const PgntOrder({
    required this.id,
    required this.status,
    this.checkoutUrl,
  });

  factory PgntOrder.fromJson(Map<String, dynamic> json) {
    return PgntOrder(
      id: '${json['order_id'] ?? json['id'] ?? ''}',
      status: '${json['status'] ?? 'pending'}',
      checkoutUrl: json['checkout_url'] as String?,
    );
  }
}

class PgntApiException implements Exception {
  final String message;

  const PgntApiException(this.message);

  @override
  String toString() => message;
}

class PgntApiService {
  final String baseUrl;

  const PgntApiService({this.baseUrl = backendBaseUrl});

  Future<List<TopUpProduct>> catalog() async {
    final response = await http
        .get(Uri.parse('$baseUrl/api/catalog'))
        .timeout(const Duration(seconds: 20));

    if (response.statusCode != 200) {
      throw const PgntApiException(
        'د محصولاتو معلومات اوس نه ترلاسه کېږي.',
      );
    }

    final decoded = jsonDecode(response.body);

    final List<dynamic> items;
    if (decoded is List) {
      items = decoded;
    } else if (decoded is Map && decoded['products'] is List) {
      items = decoded['products'] as List<dynamic>;
    } else if (decoded is Map && decoded['data'] is List) {
      items = decoded['data'] as List<dynamic>;
    } else {
      throw const PgntApiException(
        'د سرور د محصولاتو بڼه سمه نه ده.',
      );
    }

    return items
        .whereType<Map<String, dynamic>>()
        .map(TopUpProduct.fromJson)
        .toList();
  }

  Future<PgntOrder> createCheckout({
    required String productId,
    required String phone,
    required String countryCode,
    required String operatorName,
  }) async {
    final response = await http
        .post(
          Uri.parse('$baseUrl/api/payments/checkout'),
          headers: {'Content-Type': 'application/json'},
          body: jsonEncode({
            'product_id': productId,
            'phone': phone,
            'country_code': countryCode,
            'operator_name': operatorName,
          }),
        )
        .timeout(const Duration(seconds: 25));

    final dynamic decoded;
    try {
      decoded = jsonDecode(response.body);
    } catch (_) {
      throw const PgntApiException(
        'د تادیې سرور ناسم ځواب ورکړ.',
      );
    }

    if (response.statusCode < 200 ||
        response.statusCode >= 300 ||
        decoded is! Map<String, dynamic>) {
      throw PgntApiException(
        '${decoded is Map ? decoded['error'] ?? 'تادیه جوړه نه شوه' : 'تادیه جوړه نه شوه'}',
      );
    }

    return PgntOrder.fromJson(decoded);
  }

  Future<Map<String, dynamic>> getOrder(String orderId) async {
    final response = await http
        .get(Uri.parse('$baseUrl/api/orders/$orderId'))
        .timeout(const Duration(seconds: 20));

    if (response.statusCode != 200) {
      throw const PgntApiException(
        'د امر حالت ترلاسه نه شو.',
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const PgntApiException('د امر معلومات سم نه دي.');
    }

    return decoded;
  }

  Future<void> openCheckout(String url) async {
    final uri = Uri.tryParse(url);

    if (uri == null ||
        uri.scheme != 'https' ||
        uri.host.isEmpty) {
      throw const PgntApiException('د تادیې لینک معتبر نه دی.');
    }

    final opened = await launchUrl(
      uri,
      mode: LaunchMode.externalApplication,
    );

    if (!opened) {
      throw const PgntApiException(
        'د تادیې پاڼه نه پرانیستل کېږي.',
      );
    }
  }
}

final PgntApiService pgntApi = PgntApiService();
class PgntMainShell extends StatefulWidget {
  const PgntMainShell({super.key});

  @override
  State<PgntMainShell> createState() => _PgntMainShellState();
}

class _PgntMainShellState extends State<PgntMainShell> {
  int selectedIndex = 0;

  final List<Widget> pages = const [
    PgntHomePage(),
    PgntHistoryPage(),
    PgntWalletPage(),
    PgntProfilePage(),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            const PgntBrandHeader(),
            Expanded(
              child: IndexedStack(
                index: selectedIndex,
                children: pages,
              ),
            ),
          ],
        ),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        backgroundColor: Colors.white,
        indicatorColor: gold.withValues(alpha: 0.35),
        onDestinationSelected: (index) {
          setState(() => selectedIndex = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.home_outlined),
            selectedIcon: Icon(Icons.home, color: primaryRed),
            label: 'کور',
          ),
          NavigationDestination(
            icon: Icon(Icons.receipt_long_outlined),
            selectedIcon: Icon(Icons.receipt_long, color: primaryRed),
            label: 'امرونه',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet, color: primaryRed),
            label: 'والټ',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline),
            selectedIcon: Icon(Icons.person, color: primaryRed),
            label: 'پروفایل',
          ),
        ],
      ),
    );
  }
}

class PgntBrandHeader extends StatelessWidget {
  const PgntBrandHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 20, 20, 22),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [primaryRed, Color(0xFF4A0709)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.vertical(
          bottom: Radius.circular(26),
        ),
      ),
      child: Row(
        children: [
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              color: cream,
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: gold, width: 2),
            ),
            child: const Icon(
              Icons.bolt,
              color: primaryRed,
              size: 34,
            ),
          ),
          const SizedBox(width: 13),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PGNT ASIAN',
                  style: TextStyle(
                    color: brightGold,
                    fontSize: 23,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.1,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'PREMIUM MOBILE TOPUP',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 11,
                    letterSpacing: 1.2,
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const PgntSupportPage(),
                ),
              );
            },
            icon: const Icon(
              Icons.support_agent,
              color: brightGold,
              size: 29,
            ),
            tooltip: 'مرسته',
          ),
        ],
      ),
    );
  }
}

class PgntCard extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry padding;

  const PgntCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: padding,
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gold.withValues(alpha: 0.55)),
        boxShadow: [
          BoxShadow(
            color: primaryRed.withValues(alpha: 0.04),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: child,
    );
  }
}

class PgntSectionTitle extends StatelessWidget {
  final String title;
  final String? subtitle;

  const PgntSectionTitle({
    super.key,
    required this.title,
    this.subtitle,
  });

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: const TextStyle(
            color: primaryRed,
            fontSize: 19,
            fontWeight: FontWeight.bold,
          ),
        ),
        if (subtitle != null) ...[
          const SizedBox(height: 4),
          Text(
            subtitle!,
            style: const TextStyle(
              color: Colors.black54,
              fontSize: 13,
            ),
          ),
        ],
      ],
    );
  }
}

class PgntEmptyState extends StatelessWidget {
  final IconData icon;
  final String title;
  final String message;

  const PgntEmptyState({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
  });

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 54, color: gold),
            const SizedBox(height: 14),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: primaryRed,
                fontSize: 18,
                fontWeight: FontWeight.bold,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.black54),
            ),
          ],
        ),
      ),
    );
  }
}
class PgntHomePage extends StatefulWidget {
  const PgntHomePage({super.key});

  @override
  State<PgntHomePage> createState() => _PgntHomePageState();
}

class _PgntHomePageState extends State<PgntHomePage> {
  final TextEditingController phoneController =
      TextEditingController();

  List<TopUpProduct> products = [];
  bool loading = true;
  String? errorMessage;

  @override
  void initState() {
    super.initState();
    loadProducts();
  }

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  Future<void> loadProducts() async {
    setState(() {
      loading = true;
      errorMessage = null;
    });

    try {
      final result = await pgntApi.catalog();

      if (!mounted) return;

      setState(() {
        products = result;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        loading = false;
        errorMessage = 'محصولات نه ترلاسه کېږي. بیا هڅه وکړئ.';
      });
    }
  }

  List<TopUpProduct> get countryProducts {
    return products
        .where((p) => p.countryCode.toUpperCase() ==
            appState.country.code)
        .toList();
  }

  List<String> get countryOperators {
    final fromServer = countryProducts
        .map((p) => p.operatorName)
        .where((name) => name.trim().isNotEmpty)
        .toSet()
        .toList();

    if (fromServer.isNotEmpty) {
      fromServer.sort();
      return fromServer;
    }

    return operators
        .where((o) => o.countryCode == appState.country.code)
        .map((o) => o.name)
        .toList();
  }

  void chooseCountry(AppCountry country) {
    setState(() {
      appState.setCountry(country);
    });
  }

  void continueToAmounts() {
    final phone = normalizePhone(phoneController.text);

    if (appState.operatorName == null) {
      showMessage('لومړی د موبایل شبکه انتخاب کړئ.');
      return;
    }

    if (!validPhone(appState.country.code, phone)) {
      showMessage('د موبایل شمېره سمه ولیکئ.');
      return;
    }

    final available = countryProducts
        .where((p) => p.operatorName == appState.operatorName)
        .toList();

    if (available.isEmpty) {
      showMessage('د دې شبکې محصولات اوس موجود نه دي.');
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => PgntAmountPage(
          products: available,
          country: appState.country,
          operatorName: appState.operatorName!,
          phone: phone,
        ),
      ),
    );
  }

  void showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: loadProducts,
      child: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const PgntCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'خپل موبایل چارج کړئ',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 23,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'خپل هېواد او شبکه انتخاب کړئ، '
                  'شمېره ولیکئ او د چارج اندازه وټاکئ.',
                  style: TextStyle(
                    color: Colors.black54,
                    height: 1.5,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const PgntSectionTitle(
            title: 'هېواد انتخاب کړئ',
            subtitle: 'Select your destination country',
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 9,
            runSpacing: 9,
            children: appCountries.map((country) {
              final selected = country.code == appState.country.code;

              return ChoiceChip(
                selected: selected,
                onSelected: (_) => chooseCountry(country),
                selectedColor: gold.withValues(alpha: 0.4),
                label: Text(
                  '${country.flag} ${country.name}',
                  style: TextStyle(
                    color: selected ? primaryRed : Colors.black87,
                    fontWeight:
                        selected ? FontWeight.bold : FontWeight.normal,
                  ),
                ),
                side: BorderSide(
                  color: selected ? primaryRed : gold,
                ),
              );
            }).toList(),
          ),
          const SizedBox(height: 24),
          const PgntSectionTitle(
            title: 'موبایل شبکه',
            subtitle: 'Choose mobile operator',
          ),
          const SizedBox(height: 12),
          if (loading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(24),
                child: CircularProgressIndicator(color: primaryRed),
              ),
            )
          else if (errorMessage != null)
            PgntCard(
              child: Column(
                children: [
                  Text(errorMessage!),
                  const SizedBox(height: 10),
                  ElevatedButton(
                    onPressed: loadProducts,
                    child: const Text('بیا هڅه وکړئ'),
                  ),
                ],
              ),
            )
          else if (countryOperators.isEmpty)
            const PgntEmptyState(
              icon: Icons.signal_cellular_alt,
              title: 'شبکې نشته',
              message: 'د دې هېواد لپاره محصولات لا نه دي برابر شوي.',
            )
          else
            Wrap(
              spacing: 9,
              runSpacing: 9,
              children: countryOperators.map((name) {
                final selected = appState.operatorName == name;

                return ChoiceChip(
                  selected: selected,
                  onSelected: (_) {
                    setState(() {
                      appState.setOperator(name);
                    });
                  },
                  selectedColor: gold.withValues(alpha: 0.4),
                  label: Text(name),
                  side: BorderSide(
                    color: selected ? primaryRed : gold,
                  ),
                );
              }).toList(),
            ),
          const SizedBox(height: 24),
          const PgntSectionTitle(
            title: 'د موبایل شمېره',
            subtitle: 'Enter recipient phone number',
          ),
          const SizedBox(height: 12),
          TextField(
            controller: phoneController,
            keyboardType: TextInputType.phone,
            decoration: InputDecoration(
              prefixIcon: const Icon(
                Icons.phone_android,
                color: primaryRed,
              ),
              hintText: 'د موبایل شمېره ولیکئ',
              helperText:
                  'هېواد: ${appState.country.code} '
                  '• ${appState.country.currency}',
            ),
          ),
          const SizedBox(height: 22),
          ElevatedButton.icon(
            onPressed: loading ? null : continueToAmounts,
            icon: const Icon(Icons.arrow_forward),
            label: const Text(
              'د چارج اندازه انتخاب کړئ',
              style: TextStyle(fontSize: 16),
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'بیه او بونس باید د سرور له تایید شوو معلوماتو سره سم وي.',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: Colors.black54,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 20),
        ],
      ),
    );
  }
}
class PgntAmountPage extends StatefulWidget {
  final List<TopUpProduct> products;
  final AppCountry country;
  final String operatorName;
  final String phone;

  const PgntAmountPage({
    super.key,
    required this.products,
    required this.country,
    required this.operatorName,
    required this.phone,
  });

  @override
  State<PgntAmountPage> createState() => _PgntAmountPageState();
}

class _PgntAmountPageState extends State<PgntAmountPage> {
  TopUpProduct? selectedProduct;
  bool processing = false;

  void showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> startPayment(TopUpProduct product) async {
    if (processing) return;

    setState(() => processing = true);

    try {
      final order = await pgntApi.createCheckout(
        productId: product.id,
        phone: widget.phone,
        countryCode: widget.country.code,
        operatorName: widget.operatorName,
      );

      if (!mounted) return;

      if (order.checkoutUrl == null ||
          order.checkoutUrl!.isEmpty) {
        showMessage(
          'امر جوړ شو، خو د تادیې لینک نه دی ترلاسه شوی.',
        );
        return;
      }

      await pgntApi.openCheckout(order.checkoutUrl!);

      if (!mounted) return;

      showMessage(
        'د تادیې پاڼه پرانیستل شوه. '
        'د امر شمېره: ${order.id}',
      );
    } catch (e) {
      if (mounted) {
        showMessage('تادیه پیل نه شوه. مهرباني وکړئ بیا هڅه وکړئ.');
      }
    } finally {
      if (mounted) {
        setState(() => processing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('د چارج اندازه'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          PgntCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${widget.country.flag} ${widget.country.name}',
                  style: const TextStyle(
                    fontSize: 19,
                    fontWeight: FontWeight.bold,
                    color: primaryRed,
                  ),
                ),
                const SizedBox(height: 8),
                Text('شبکه: ${widget.operatorName}'),
                const SizedBox(height: 5),
                Text('شمېره: ${widget.phone}'),
              ],
            ),
          ),
          const SizedBox(height: 22),
          const PgntSectionTitle(
            title: 'خپل محصول انتخاب کړئ',
            subtitle: 'Product prices are supplied by the server',
          ),
          const SizedBox(height: 12),
          ...widget.products.map((product) {
            final selected = selectedProduct?.id == product.id;

            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: InkWell(
                borderRadius: BorderRadius.circular(18),
                onTap: () {
                  setState(() => selectedProduct = product);
                },
                child: PgntCard(
                  child: Row(
                    children: [
                      Container(
                        width: 48,
                        height: 48,
                        decoration: BoxDecoration(
                          color: cream,
                          borderRadius: BorderRadius.circular(14),
                        ),
                        child: const Icon(
                          Icons.phone_android,
                          color: primaryRed,
                          size: 28,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              product.name.isNotEmpty
                                  ? product.name
                                  : '${product.recipientAmount} '
                                      '${product.currency}',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 5),
                            Text(
                              'ترلاسه کوونکی: '
                              '${product.recipientAmount} '
                              '${product.currency}',
                            ),
                            if (product.bonusAmount > 0)
                              Text(
                                'بونس: ${product.bonusAmount} '
                                '${product.currency}',
                                style: const TextStyle(
                                  color: Colors.green,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                          ],
                        ),
                      ),
                      Column(
                        children: [
                          Text(
                            formatEuro(product.priceEurCents),
                            style: const TextStyle(
                              color: primaryRed,
                              fontSize: 17,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          Icon(
                            selected
                                ? Icons.radio_button_checked
                                : Icons.radio_button_off,
                            color: primaryRed,
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            );
          }),
          const SizedBox(height: 8),
          const PgntCard(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(Icons.lock_outline, color: primaryRed),
                SizedBox(width: 10),
                Expanded(
                  child: Text(
                    'تادیه د Stripe خوندي پاڼې له لارې کېږي. '
                    'وروستۍ بیه، فیس او بونس باید سرور تایید کړي.',
                    style: TextStyle(height: 1.5),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            onPressed: selectedProduct == null || processing
                ? null
                : () => startPayment(selectedProduct!),
            icon: processing
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(
                      strokeWidth: 2,
                      color: Colors.white,
                    ),
                  )
                : const Icon(Icons.payment),
            label: Text(
              processing ? 'مهرباني وکړئ...' : 'تادیه وکړئ',
            ),
          ),
        ],
      ),
    );
  }
}
class PgntHistoryPage extends StatefulWidget {
  const PgntHistoryPage({super.key});

  @override
  State<PgntHistoryPage> createState() => _PgntHistoryPageState();
}

class _PgntHistoryPageState extends State<PgntHistoryPage> {
  final TextEditingController orderController =
      TextEditingController();

  bool loading = false;
  Map<String, dynamic>? order;
  String? error;

  @override
  void dispose() {
    orderController.dispose();
    super.dispose();
  }

  Future<void> checkOrder() async {
    final id = orderController.text.trim();

    if (id.isEmpty) {
      setState(() => error = 'د امر شمېره ولیکئ.');
      return;
    }

    setState(() {
      loading = true;
      error = null;
      order = null;
    });

    try {
      final result = await pgntApi.getOrder(id);

      if (!mounted) return;

      setState(() {
        order = result;
        loading = false;
      });
    } catch (_) {
      if (!mounted) return;

      setState(() {
        loading = false;
        error = 'امر ونه موندل شو یا سرور ته اتصال نشته.';
      });
    }
  }

  String statusText(String status) {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'تادیه شوې';
      case 'pending':
        return 'د تایید په انتظار';
      case 'processing':
        return 'د چارج پروسه روانه ده';
      case 'completed':
      case 'successful':
      case 'success':
        return 'بریالی';
      case 'failed':
        return 'ناکام';
      case 'refunded':
        return 'پیسې بېرته ورکړل شوې';
      case 'review':
        return 'د بیاکتنې په حال کې';
      default:
        return status;
    }
  }

  Color statusColor(String status) {
    switch (status.toLowerCase()) {
      case 'completed':
      case 'successful':
      case 'success':
        return Colors.green;
      case 'failed':
      case 'refunded':
        return Colors.red;
      case 'review':
        return Colors.orange;
      default:
        return primaryRed;
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const PgntSectionTitle(
          title: 'د امرونو تاریخ',
          subtitle: 'Order tracking',
        ),
        const SizedBox(height: 16),
        PgntCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'د امر شمېره ولیکئ',
                style: TextStyle(fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: orderController,
                decoration: const InputDecoration(
                  hintText: 'Order ID',
                  prefixIcon: Icon(
                    Icons.receipt_long,
                    color: primaryRed,
                  ),
                ),
              ),
              const SizedBox(height: 12),
              ElevatedButton(
                onPressed: loading ? null : checkOrder,
                child: Text(
                  loading ? 'لټون...' : 'د امر حالت وګورئ',
                ),
              ),
              if (error != null) ...[
                const SizedBox(height: 12),
                Text(
                  error!,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
            ],
          ),
        ),
        const SizedBox(height: 18),
        if (order != null)
          PgntCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text(
                  'د امر معلومات',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 14),
                SelectableText(
                  'Order ID: ${order!['order_id'] ?? order!['id'] ?? orderController.text}',
                ),
                const SizedBox(height: 10),
                Row(
                  children: [
                    const Text('حالت: '),
                    Expanded(
                      child: Text(
                        statusText('${order!['status'] ?? 'unknown'}'),
                        style: TextStyle(
                          color: statusColor(
                            '${order!['status'] ?? 'unknown'}',
                          ),
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                    ),
                  ],
                ),
                if (order!['message'] != null) ...[
                  const SizedBox(height: 10),
                  Text('${order!['message']}'),
                ],
              ],
            ),
          ),
        const SizedBox(height: 18),
        const PgntCard(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, color: primaryRed),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'د امر حالت د سرور له معلوماتو سره سم ښودل کېږي. '
                  'د تادیې یا چارج بریا یوازې د موبایل د پیغام '
                  'پر بنسټ نه تاییدېږي.',
                  style: TextStyle(height: 1.5),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class PgntWalletPage extends StatelessWidget {
  const PgntWalletPage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const PgntSectionTitle(
          title: 'زما والټ',
          subtitle: 'Wallet balance and rewards',
        ),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(24),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [primaryRed, Color(0xFF4A0709)],
            ),
            borderRadius: BorderRadius.circular(24),
          ),
          child: const Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(
                Icons.account_balance_wallet,
                color: brightGold,
                size: 36,
              ),
              SizedBox(height: 18),
              Text(
                'د والټ بیلانس',
                style: TextStyle(color: Colors.white70),
              ),
              SizedBox(height: 8),
              Text(
                '€0.00',
                style: TextStyle(
                  color: brightGold,
                  fontSize: 34,
                  fontWeight: FontWeight.bold,
                ),
              ),
              SizedBox(height: 8),
              Text(
                'والټ باید د خوندي سرور له لارې اداره شي.',
                style: TextStyle(color: Colors.white70),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const PgntCard(
          child: Row(
            children: [
              Icon(Icons.card_giftcard, color: primaryRed, size: 32),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Share Bonus',
                      style: TextStyle(
                        fontWeight: FontWeight.bold,
                        fontSize: 17,
                      ),
                    ),
                    SizedBox(height: 5),
                    Text(
                      'ملګرو ته اپ معرفي کړئ او د فعالو شرایطو '
                      'له مخې انعام ترلاسه کړئ.',
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 18),
        const PgntCard(
          child: Row(
            children: [
              Icon(Icons.security, color: primaryRed, size: 30),
              SizedBox(width: 12),
              Expanded(
                child: Text(
                  'د والټ حقیقي بیلانس، انعامونه او بېرته ورکړل شوې '
                  'پیسې باید د سرور په ډیټابېس کې ثبت او تایید شي.',
                  style: TextStyle(height: 1.5),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class PgntProfilePage extends StatelessWidget {
  const PgntProfilePage({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(18),
      children: [
        const PgntSectionTitle(
          title: 'پروفایل او تنظیمات',
          subtitle: 'Language and preferences',
        ),
        const SizedBox(height: 16),
        PgntCard(
          child: Column(
            children: [
              const CircleAvatar(
                radius: 35,
                backgroundColor: cream,
                child: Icon(
                  Icons.person,
                  size: 40,
                  color: primaryRed,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'PGNT ASIAN TOPUP',
                style: TextStyle(
                  color: primaryRed,
                  fontSize: 18,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 6),
              const Text(
                'د ژبې انتخاب',
                style: TextStyle(color: Colors.black54),
              ),
              const SizedBox(height: 12),
              const PgntLanguageSelector(),
            ],
          ),
        ),
        const SizedBox(height: 16),
        ListTile(
          leading: const Icon(Icons.support_agent, color: primaryRed),
          title: const Text('د مشتریانو ملاتړ'),
          subtitle: const Text('مرسته او پوښتنې'),
          trailing: const Icon(Icons.chevron_right),
          onTap: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const PgntSupportPage(),
              ),
            );
          },
        ),
        const Divider(),
        const ListTile(
          leading: Icon(Icons.verified_user, color: primaryRed),
          title: Text('امنیت'),
          subtitle: Text('خپل شخصي معلومات خوندي وساتئ'),
        ),
        const ListTile(
          leading: Icon(Icons.info_outline, color: primaryRed),
          title: Text('د اپ نوم'),
          subtitle: Text('PGNT ASIAN TOPUP'),
        ),
      ],
    );
  }
}

class PgntLanguageSelector extends StatelessWidget {
  const PgntLanguageSelector({super.key});

  @override
  Widget build(BuildContext context) {
    return DropdownButtonFormField<String>(
      initialValue: appState.languageCode,
      decoration: const InputDecoration(
        prefixIcon: Icon(Icons.language, color: primaryRed),
        labelText: 'ژبه',
      ),
      items: appLanguages.map((language) {
        return DropdownMenuItem<String>(
          value: language.code,
          child: Text(language.nativeName),
        );
      }).toList(),
      onChanged: (value) {
        if (value != null) {
          appState.setLanguage(value);
        }
      },
    );
  }
}

class PgntSupportPage extends StatelessWidget {
  const PgntSupportPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('د مشتریانو ملاتړ'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(18),
        children: [
          const PgntCard(
            child: Column(
              children: [
                Icon(
                  Icons.support_agent,
                  color: primaryRed,
                  size: 56,
                ),
                SizedBox(height: 12),
                Text(
                  'څنګه مرسته درسره وکړو؟',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 21,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 8),
                Text(
                  'که تادیه شوې وي خو چارج نه وي رسېدلی، '
                  'د امر شمېره وساتئ او د امر حالت وګورئ.',
                  textAlign: TextAlign.center,
                  style: TextStyle(height: 1.5),
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          const PgntCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'عامې پوښتنې',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 18,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                SizedBox(height: 14),
                Text(
                  '۱. چارج څومره وخت نیسي؟\n'
                  'د شبکې او عرضه کوونکي له وضعیت سره تړاو لري.',
                ),
                SizedBox(height: 14),
                Text(
                  '۲. که چارج ناکام شي څه وکړم؟\n'
                  'د امر حالت وګورئ او د بیاکتنې یا Refund غوښتنه وکړئ.',
                ),
                SizedBox(height: 14),
                Text(
                  '۳. ایا پیسې دوه ځله اخیستل کېږي؟\n'
                  'د تادیاتو او امرونو د تکرار مخنیوی باید په سرور کې وشي.',
                ),
              ],
            ),
          ),
          const SizedBox(height: 18),
          ElevatedButton.icon(
            onPressed: () {
              Navigator.pop(context);
            },
            icon: const Icon(Icons.arrow_back),
            label: const Text('بېرته ستنېدل'),
          ),
        ],
      ),
    );
  }
}

class PgntTranslations {
  static const Map<String, Map<String, String>> values = {
    'ps': {
      'home': 'کور',
      'history': 'امرونه',
      'wallet': 'والټ',
      'profile': 'پروفایل',
      'support': 'مرسته',
      'select_country': 'هېواد انتخاب کړئ',
      'select_operator': 'موبایل شبکه انتخاب کړئ',
      'enter_phone': 'د موبایل شمېره ولیکئ',
      'choose_amount': 'د چارج اندازه انتخاب کړئ',
      'pay': 'تادیه وکړئ',
    },
    'fa': {
      'home': 'خانه',
      'history': 'سفارش‌ها',
      'wallet': 'کیف پول',
      'profile': 'پروفایل',
      'support': 'پشتیبانی',
      'select_country': 'کشور را انتخاب کنید',
      'select_operator': 'شبکه موبایل را انتخاب کنید',
      'enter_phone': 'شماره موبایل را وارد کنید',
      'choose_amount': 'مقدار شارژ را انتخاب کنید',
      'pay': 'پرداخت',
    },
    'en': {
      'home': 'Home',
      'history': 'Orders',
      'wallet': 'Wallet',
      'profile': 'Profile',
      'support': 'Support',
      'select_country': 'Select country',
      'select_operator': 'Select operator',
      'enter_phone': 'Enter phone number',
      'choose_amount': 'Choose top-up amount',
      'pay': 'Pay now',
    },
    'ur': {
      'home': 'ہوم',
      'history': 'آرڈرز',
      'wallet': 'والٹ',
      'profile': 'پروفائل',
      'support': 'مدد',
      'select_country': 'ملک منتخب کریں',
      'select_operator': 'موبائل نیٹ ورک منتخب کریں',
      'enter_phone': 'موبائل نمبر درج کریں',
      'choose_amount': 'ریچارج رقم منتخب کریں',
      'pay': 'ادائیگی کریں',
    },
    'hi': {
      'home': 'होम',
      'history': 'ऑर्डर',
      'wallet': 'वॉलेट',
      'profile': 'प्रोफ़ाइल',
      'support': 'सहायता',
      'select_country': 'देश चुनें',
      'select_operator': 'मोबाइल नेटवर्क चुनें',
      'enter_phone': 'मोबाइल नंबर दर्ज करें',
      'choose_amount': 'रीचार्ज राशि चुनें',
      'pay': 'भुगतान करें',
    },
    'bn': {
      'home': 'হোম',
      'history': 'অর্ডার',
      'wallet': 'ওয়ালেট',
      'profile': 'প্রোফাইল',
      'support': 'সহায়তা',
      'select_country': 'দেশ নির্বাচন করুন',
      'select_operator': 'মোবাইল নেটওয়ার্ক নির্বাচন করুন',
      'enter_phone': 'মোবাইল নম্বর লিখুন',
      'choose_amount': 'রিচার্জের পরিমাণ নির্বাচন করুন',
      'pay': 'পেমেন্ট করুন',
    },
  };

  static String text(String languageCode, String key) {
    return values[languageCode]?[key] ??
        values['en']?[key] ??
        key;
  }
}
