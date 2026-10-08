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
const Color pageBg = Color(0xFFF8F5F0);

void main() {
  runApp(const PgntAsianApp());
}

class AppCountry {
  final String code;
  final String name;
  final String flag;
  final String currency;
  final String symbol;

  const AppCountry({
    required this.code,
    required this.name,
    required this.flag,
    required this.currency,
    required this.symbol,
  });
}

const List<AppCountry> countries = [
  AppCountry(
    code: 'AF',
    name: 'Afghanistan',
    flag: '🇦🇫',
    currency: 'AFN',
    symbol: '؋',
  ),
  AppCountry(
    code: 'PK',
    name: 'Pakistan',
    flag: '🇵🇰',
    currency: 'PKR',
    symbol: 'Rs',
  ),
  AppCountry(
    code: 'IN',
    name: 'India',
    flag: '🇮🇳',
    currency: 'INR',
    symbol: '₹',
  ),
  AppCountry(
    code: 'BD',
    name: 'Bangladesh',
    flag: '🇧🇩',
    currency: 'BDT',
    symbol: '৳',
  ),
];

class AppLanguage {
  final String code;
  final String name;
  final String nativeName;

  const AppLanguage(this.code, this.name, this.nativeName);
}

const List<AppLanguage> languages = [
  AppLanguage('ps', 'Pashto', 'پښتو'),
  AppLanguage('fa', 'Dari', 'دری'),
  AppLanguage('en', 'English', 'English'),
  AppLanguage('ur', 'Urdu', 'اردو'),
  AppLanguage('hi', 'Hindi', 'हिन्दी'),
  AppLanguage('bn', 'Bengali', 'বাংলা'),
];

class MobileOperator {
  final String countryCode;
  final String name;
  final String icon;

  const MobileOperator(this.countryCode, this.name, this.icon);
}

const List<MobileOperator> operators = [
  MobileOperator('AF', 'Roshan', '📶'),
  MobileOperator('AF', 'Etisalat', '📱'),
  MobileOperator('AF', 'AWCC', '📡'),
  MobileOperator('AF', 'Salaam', '☎️'),
  MobileOperator('PK', 'Jazz', '📶'),
  MobileOperator('PK', 'Zong', '📱'),
  MobileOperator('PK', 'Ufone', '📡'),
  MobileOperator('PK', 'Telenor', '☎️'),
  MobileOperator('IN', 'Airtel', '📶'),
  MobileOperator('IN', 'Jio', '📱'),
  MobileOperator('IN', 'Vi', '📡'),
  MobileOperator('BD', 'Grameenphone', '📶'),
  MobileOperator('BD', 'Robi', '📱'),
  MobileOperator('BD', 'Banglalink', '📡'),
];

const Map<String, List<int>> rechargeAmounts = {
  'AFN': [100, 250, 500, 1000],
  'PKR': [500, 1000, 2000, 5000],
  'INR': [200, 500, 1000, 2000],
  'BDT': [200, 500, 1000, 2000],
};
const Map<String, Map<String, String>> translations = {
  'ps': {
    'home': 'کور',
    'history': 'د معاملاتو تاریخچه',
    'settings': 'تنظیمات',
    'selectCountry': 'هېواد انتخاب کړئ',
    'phone': 'د ټیلیفون شمېره',
    'operator': 'د موبایل شبکه',
    'amount': 'د چارج اندازه',
    'continue': 'تادیې ته دوام ورکړئ',
    'language': 'ژبه',
    'secure': 'خوندي تادیه',
    'welcome': 'ښه راغلاست',
    'noHistory': 'تر اوسه معامله نشته',
    'invalidPhone': 'مهرباني وکړئ د ټیلیفون سمه شمېره ولیکئ',
    'selectOperator': 'لومړی شبکه انتخاب کړئ',
    'loading': 'مهرباني وکړئ انتظار وکړئ...',
    'paymentError': 'تادیه پیل نه شوه. بیا هڅه وکړئ.',
    'success': 'د تادیې پاڼه پرانیستل شوه',
    'priceNote': 'وروستۍ بیه د سرور له خوا تاییدېږي',
    'wallet': 'والټ',
    'bonus': 'بونس',
    'fee': 'فیس',
  },
  'fa': {
    'home': 'خانه',
    'history': 'تاریخچه تراکنش‌ها',
    'settings': 'تنظیمات',
    'selectCountry': 'کشور را انتخاب کنید',
    'phone': 'شماره تلفن',
    'operator': 'شبکه موبایل',
    'amount': 'مقدار شارژ',
    'continue': 'ادامه به پرداخت',
    'language': 'زبان',
    'secure': 'پرداخت امن',
    'welcome': 'خوش آمدید',
    'noHistory': 'هنوز تراکنشی وجود ندارد',
    'invalidPhone': 'شماره تلفن معتبر وارد کنید',
    'selectOperator': 'ابتدا شبکه را انتخاب کنید',
    'loading': 'لطفاً صبر کنید...',
    'paymentError': 'پرداخت آغاز نشد. دوباره تلاش کنید.',
    'success': 'صفحه پرداخت باز شد',
    'priceNote': 'قیمت نهایی در سرور تأیید می‌شود',
    'wallet': 'کیف پول',
    'bonus': 'بونوس',
    'fee': 'کارمزد',
  },
  'en': {
    'home': 'Home',
    'history': 'Transaction History',
    'settings': 'Settings',
    'selectCountry': 'Select Country',
    'phone': 'Phone Number',
    'operator': 'Mobile Operator',
    'amount': 'Recharge Amount',
    'continue': 'Continue to Payment',
    'language': 'Language',
    'secure': 'Secure Payment',
    'welcome': 'Welcome',
    'noHistory': 'No transactions yet',
    'invalidPhone': 'Enter a valid phone number',
    'selectOperator': 'Please select an operator',
    'loading': 'Please wait...',
    'paymentError': 'Could not start payment. Try again.',
    'success': 'Payment page opened',
    'priceNote': 'Final price is verified by the server',
    'wallet': 'Wallet',
    'bonus': 'Bonus',
    'fee': 'Fee',
  },
  'ur': {
    'home': 'ہوم',
    'history': 'لین دین کی تاریخ',
    'settings': 'ترتیبات',
    'selectCountry': 'ملک منتخب کریں',
    'phone': 'فون نمبر',
    'operator': 'موبائل نیٹ ورک',
    'amount': 'ریچارج کی رقم',
    'continue': 'ادائیگی جاری رکھیں',
    'language': 'زبان',
    'secure': 'محفوظ ادائیگی',
    'welcome': 'خوش آمدید',
    'noHistory': 'ابھی کوئی لین دین نہیں',
    'invalidPhone': 'درست فون نمبر درج کریں',
    'selectOperator': 'پہلے نیٹ ورک منتخب کریں',
    'loading': 'براہ کرم انتظار کریں...',
    'paymentError': 'ادائیگی شروع نہیں ہوئی۔ دوبارہ کوشش کریں۔',
    'success': 'ادائیگی کا صفحہ کھل گیا',
    'priceNote': 'حتمی قیمت سرور پر تصدیق ہوگی',
    'wallet': 'والٹ',
    'bonus': 'بونس',
    'fee': 'فیس',
  },
  'hi': {
    'home': 'होम',
    'history': 'लेन-देन इतिहास',
    'settings': 'सेटिंग्स',
    'selectCountry': 'देश चुनें',
    'phone': 'फोन नंबर',
    'operator': 'मोबाइल नेटवर्क',
    'amount': 'रिचार्ज राशि',
    'continue': 'भुगतान जारी रखें',
    'language': 'भाषा',
    'secure': 'सुरक्षित भुगतान',
    'welcome': 'स्वागत है',
    'noHistory': 'अभी कोई लेन-देन नहीं',
    'invalidPhone': 'सही फोन नंबर दर्ज करें',
    'selectOperator': 'पहले नेटवर्क चुनें',
    'loading': 'कृपया प्रतीक्षा करें...',
    'paymentError': 'भुगतान शुरू नहीं हुआ। फिर प्रयास करें।',
    'success': 'भुगतान पृष्ठ खुल गया',
    'priceNote': 'अंतिम कीमत सर्वर सत्यापित करेगा',
    'wallet': 'वॉलेट',
    'bonus': 'बोनस',
    'fee': 'शुल्क',
  },
  'bn': {
    'home': 'হোম',
    'history': 'লেনদেনের ইতিহাস',
    'settings': 'সেটিংস',
    'selectCountry': 'দেশ নির্বাচন করুন',
    'phone': 'ফোন নম্বর',
    'operator': 'মোবাইল নেটওয়ার্ক',
    'amount': 'রিচার্জের পরিমাণ',
    'continue': 'পেমেন্ট চালিয়ে যান',
    'language': 'ভাষা',
    'secure': 'নিরাপদ পেমেন্ট',
    'welcome': 'স্বাগতম',
    'noHistory': 'এখনও কোনো লেনদেন নেই',
    'invalidPhone': 'সঠিক ফোন নম্বর লিখুন',
    'selectOperator': 'প্রথমে নেটওয়ার্ক নির্বাচন করুন',
    'loading': 'অনুগ্রহ করে অপেক্ষা করুন...',
    'paymentError': 'পেমেন্ট শুরু হয়নি। আবার চেষ্টা করুন।',
    'success': 'পেমেন্ট পৃষ্ঠা খোলা হয়েছে',
    'priceNote': 'চূড়ান্ত মূল্য সার্ভার যাচাই করবে',
    'wallet': 'ওয়ালেট',
    'bonus': 'বোনাস',
    'fee': 'ফি',
  },
};

String tr(String language, String key) {
  return translations[language]?[key] ??
      translations['en']?[key] ??
      key;
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
            minimumSize: const Size(double.infinity, 52),
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
      home: const PgntHomePage(),
    );
  }
}

class PgntHomePage extends StatefulWidget {
  const PgntHomePage({super.key});

  @override
  State<PgntHomePage> createState() => _PgntHomePageState();
}

class _PgntHomePageState extends State<PgntHomePage> {
  String languageCode = 'ps';
  AppCountry selectedCountry = countries.first;
  MobileOperator? selectedOperator;
  int selectedAmount = 100;
  int selectedTab = 0;
  bool isLoading = false;

  final TextEditingController phoneController =
      TextEditingController();

  final List<Map<String, String>> transactionHistory = [];

  String get currency => selectedCountry.currency;

  List<MobileOperator> get availableOperators {
    return operators
        .where((item) => item.countryCode == selectedCountry.code)
        .toList();
  }

  List<int> get availableAmounts {
    return rechargeAmounts[currency] ?? [100, 250, 500];
  }

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  void changeCountry(AppCountry? country) {
    if (country == null) return;

    setState(() {
      selectedCountry = country;
      selectedOperator = null;
      selectedAmount = (rechargeAmounts[country.currency] ??
              [100, 250, 500])
          .first;
      phoneController.clear();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          appName,
          style: TextStyle(fontWeight: FontWeight.bold),
        ),
        actions: [
          IconButton(
            tooltip: tr(languageCode, 'settings'),
            onPressed: openSettings,
            icon: const Icon(Icons.settings_outlined),
          ),
        ],
      ),
      body: IndexedStack(
        index: selectedTab,
        children: [
          buildHome(),
          buildHistory(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedTab,
        onDestinationSelected: (index) {
          setState(() => selectedTab = index);
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: tr(languageCode, 'home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long),
            label: tr(languageCode, 'history'),
          ),
        ],
      ),
    );
  }

  Widget buildHome() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          buildWelcomeCard(),
          const SizedBox(height: 20),
          buildCountrySelector(),
          const SizedBox(height: 18),
          buildPhoneField(),
          const SizedBox(height: 18),
          buildOperatorSelector(),
          const SizedBox(height: 18),
          buildAmountSelector(),
          const SizedBox(height: 18),
          buildPriceNote(),
          const SizedBox(height: 20),
          buildPaymentButton(),
          const SizedBox(height: 12),
          buildSecureNote(),
          const SizedBox(height: 24),
        ],
      ),
    );
  }
    Widget buildWelcomeCard() {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [primaryRed, Color(0xFF4B070A)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(
            Icons.phone_android,
            size: 38,
            color: brightGold,
          ),
          const SizedBox(height: 12),
          Text(
            tr(languageCode, 'welcome'),
            style: const TextStyle(
              color: Colors.white70,
              fontSize: 15,
            ),
          ),
          const SizedBox(height: 5),
          const Text(
            'PGNT ASIAN TOPUP',
            style: TextStyle(
              color: Colors.white,
              fontSize: 22,
              fontWeight: FontWeight.bold,
            ),
          ),
          const SizedBox(height: 8),
          const Text(
            'Afghanistan • Pakistan • India • Bangladesh',
            style: TextStyle(
              color: Colors.white70,
              fontSize: 12,
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              const Icon(
                Icons.card_giftcard,
                color: brightGold,
              ),
              const SizedBox(width: 8),
              Text(
                '${tr(languageCode, 'bonus')} • ${tr(languageCode, 'fee')}',
                style: const TextStyle(color: Colors.white),
              ),
            ],
          ),
        ],
      ),
    );
  }

  Widget sectionTitle(String text) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          fontSize: 16,
          fontWeight: FontWeight.bold,
        ),
      ),
    );
  }

  Widget buildCountrySelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle(tr(languageCode, 'selectCountry')),
        DropdownButtonFormField<AppCountry>(
          value: selectedCountry,
          isExpanded: true,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.public),
          ),
          items: countries.map((country) {
            return DropdownMenuItem<AppCountry>(
              value: country,
              child: Text(
                '${country.flag}  ${country.name} (${country.currency})',
              ),
            );
          }).toList(),
          onChanged: changeCountry,
        ),
      ],
    );
  }

  Widget buildPhoneField() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle(tr(languageCode, 'phone')),
        TextField(
          controller: phoneController,
          keyboardType: TextInputType.phone,
          maxLength: 16,
          decoration: InputDecoration(
            hintText: '07XXXXXXXX',
            prefixIcon: const Icon(Icons.phone_android),
            counterText: '',
            suffixIcon: const Icon(
              Icons.verified_user_outlined,
              color: primaryRed,
            ),
          ),
        ),
      ],
    );
  }

  Widget buildOperatorSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle(tr(languageCode, 'operator')),
        DropdownButtonFormField<MobileOperator>(
          value: selectedOperator,
          isExpanded: true,
          decoration: const InputDecoration(
            prefixIcon: Icon(Icons.signal_cellular_alt),
          ),
          hint: Text(tr(languageCode, 'selectOperator')),
          items: availableOperators.map((item) {
            return DropdownMenuItem<MobileOperator>(
              value: item,
              child: Text('${item.icon}  ${item.name}'),
            );
          }).toList(),
          onChanged: (value) {
            setState(() => selectedOperator = value);
          },
        ),
      ],
    );
  }

  Widget buildAmountSelector() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        sectionTitle(tr(languageCode, 'amount')),
        Wrap(
          spacing: 10,
          runSpacing: 10,
          children: availableAmounts.map((amount) {
            final isSelected = selectedAmount == amount;

            return ChoiceChip(
              label: Text('$amount $currency'),
              selected: isSelected,
              selectedColor: gold,
              labelStyle: TextStyle(
                color: isSelected ? primaryRed : Colors.black87,
                fontWeight: FontWeight.bold,
              ),
              onSelected: (_) {
                setState(() => selectedAmount = amount);
              },
            );
          }).toList(),
        ),
      ],
    );
  }

  Widget buildPriceNote() {
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF0D0),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: gold),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.info_outline, color: primaryRed),
          const SizedBox(width: 10),
          Expanded(
            child: Text(tr(languageCode, 'priceNote')),
          ),
        ],
      ),
    );
  }

  Widget buildSecureNote() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(Icons.lock_outline, size: 18, color: Colors.green),
        const SizedBox(width: 6),
        Text(
          tr(languageCode, 'secure'),
          style: const TextStyle(color: Colors.black54),
        ),
      ],
    );
  }
    Widget buildPaymentButton() {
    return ElevatedButton(
      onPressed: isLoading ? null : startPayment,
      child: isLoading
          ? const SizedBox(
              height: 22,
              width: 22,
              child: CircularProgressIndicator(
                color: Colors.white,
                strokeWidth: 2,
              ),
            )
          : Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Icon(Icons.lock),
                const SizedBox(width: 8),
                Text(tr(languageCode, 'continue')),
              ],
            ),
    );
  }

  String cleanPhone(String value) {
    return value.replaceAll(RegExp(r'[\s\-()]'), '');
  }

  bool isPhoneValid(String value) {
    final phone = cleanPhone(value);
    final digits = phone.startsWith('+')
        ? phone.substring(1)
        : phone;

    if (!RegExp(r'^\d+$').hasMatch(digits)) {
      return false;
    }

    switch (selectedCountry.code) {
      case 'AF':
        return digits.length >= 9 && digits.length <= 12;
      case 'PK':
        return digits.length >= 10 && digits.length <= 13;
      case 'IN':
        return digits.length >= 10 && digits.length <= 13;
      case 'BD':
        return digits.length >= 10 && digits.length <= 13;
      default:
        return false;
    }
  }

  Future<void> startPayment() async {
    final phone = cleanPhone(phoneController.text);

    if (!isPhoneValid(phone)) {
      showMessage(tr(languageCode, 'invalidPhone'));
      return;
    }

    if (selectedOperator == null) {
      showMessage(tr(languageCode, 'selectOperator'));
      return;
    }

    setState(() => isLoading = true);

    try {
      final uri = Uri.parse(
        '$backendBaseUrl/api/payments/checkout',
      );

      final response = await http
          .post(
            uri,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: jsonEncode({
              'country': selectedCountry.code,
              'countryCode': selectedCountry.code,
              'phone': phone,
              'phoneNumber': phone,
              'operator': selectedOperator!.name,
              'amount': selectedAmount,
              'currency': currency,
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception('Checkout HTTP ${response.statusCode}');
      }

      final dynamic decoded = jsonDecode(response.body);

      if (decoded is! Map<String, dynamic>) {
        throw Exception('Invalid checkout response');
      }

      final checkoutUrl = decoded['checkoutUrl'] ??
          decoded['url'] ??
          decoded['sessionUrl'];

      if (checkoutUrl is! String || checkoutUrl.isEmpty) {
        throw Exception('Checkout URL missing');
      }

      final paymentUri = Uri.tryParse(checkoutUrl);

      if (paymentUri == null ||
          paymentUri.scheme != 'https') {
        throw Exception('Invalid payment URL');
      }

      final opened = await launchUrl(
        paymentUri,
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception('Could not open payment page');
      }

      if (!mounted) return;

      setState(() {
        transactionHistory.insert(0, {
          'phone': phone,
          'operator': selectedOperator!.name,
          'amount': '$selectedAmount $currency',
          'status': 'Pending',
        });
      });

      showMessage(tr(languageCode, 'success'));
    } catch (error) {
      if (mounted) {
        showMessage(tr(languageCode, 'paymentError'));
      }
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  void showMessage(String message) {
    if (!mounted) return;

    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(
        SnackBar(
          content: Text(message),
          behavior: SnackBarBehavior.floating,
        ),
      );
  }
    Widget buildHistory() {
    return SafeArea(
      child: transactionHistory.isEmpty
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(
                      Icons.receipt_long_outlined,
                      size: 64,
                      color: gold,
                    ),
                    const SizedBox(height: 16),
                    Text(
                      tr(languageCode, 'noHistory'),
                      textAlign: TextAlign.center,
                      style: const TextStyle(fontSize: 16),
                    ),
                  ],
                ),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: transactionHistory.length,
              itemBuilder: (context, index) {
                final item = transactionHistory[index];

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  color: Colors.white,
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: Color(0xFFFFE6E6),
                      child: Icon(
                        Icons.phone_android,
                        color: primaryRed,
                      ),
                    ),
                    title: Text(
                      item['operator'] ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    subtitle: Text(
                      '${item['phone'] ?? ''}\n'
                      '${item['status'] ?? 'Pending'}',
                    ),
                    isThreeLine: true,
                    trailing: Text(
                      item['amount'] ?? '',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                        color: primaryRed,
                      ),
                    ),
                  ),
                );
              },
            ),
    );
    }
    void openSettings() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: pageBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(22),
        ),
      ),
      builder: (sheetContext) {
        return StatefulBuilder(
          builder: (context, setSheetState) {
            return SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Center(
                      child: Container(
                        height: 4,
                        width: 42,
                        decoration: BoxDecoration(
                          color: gold,
                          borderRadius: BorderRadius.circular(8),
                        ),
                      ),
                    ),
                    const SizedBox(height: 20),
                    Text(
                      tr(languageCode, 'settings'),
                      style: const TextStyle(
                        fontSize: 21,
                        fontWeight: FontWeight.bold,
                        color: primaryRed,
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      tr(languageCode, 'language'),
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    ...languages.map((language) {
                      return RadioListTile<String>(
                        contentPadding: EdgeInsets.zero,
                        title: Text(language.nativeName),
                        subtitle: Text(language.name),
                        value: language.code,
                        groupValue: languageCode,
                        activeColor: primaryRed,
                        onChanged: (value) {
                          if (value == null) return;

                          setState(() {
                            languageCode = value;
                          });

                          setSheetState(() {});
                          Navigator.pop(sheetContext);
                        },
                      );
                    }),
                    const SizedBox(height: 10),
                    const Divider(),
                    const SizedBox(height: 8),
                    const Row(
                      children: [
                        Icon(
                          Icons.shield_outlined,
                          color: primaryRed,
                        ),
                        SizedBox(width: 10),
                        Expanded(
                          child: Text(
                            'PGNT ASIAN TOPUP',
                            style: TextStyle(
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'Secure payment processing through the backend.',
                      style: TextStyle(color: Colors.black54),
                    ),
                    const SizedBox(height: 12),
                  ],
                ),
              ),
            );
          },
        );
      },
    );
    }
}
