
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

const String appName = 'PGNT ASIAN TOPUP';

const String backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'https://pgnt-asian-backend.onrender.com',
);

// Brand colors
const Color primaryRed = Color(0xFF7A0C10);
const Color darkRed = Color(0xFF450609);
const Color gold = Color(0xFFD4B896);
const Color brightGold = Color(0xFFFFD700);
const Color cream = Color(0xFFFFF8E7);
const Color pageBg = Color(0xFFF8F5F0);
const Color cardWhite = Color(0xFFFFFFFF);
const Color successGreen = Color(0xFF238636);
const Color errorRed = Color(0xFFB42318);

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const PgntAsianApp());
}

// Supported countries
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

// Six app languages
class AppLanguage {
  final String code;
  final String name;
  final String nativeName;

  const AppLanguage(
    this.code,
    this.name,
    this.nativeName,
  );
}

const List<AppLanguage> languages = [
  AppLanguage('ps', 'Pashto', 'پښتو'),
  AppLanguage('fa', 'Dari', 'دری'),
  AppLanguage('en', 'English', 'English'),
  AppLanguage('ur', 'Urdu', 'اردو'),
  AppLanguage('hi', 'Hindi', 'हिन्दी'),
  AppLanguage('bn', 'Bengali', 'বাংলা'),
];

// Mobile operators
class MobileOperator {
  final String countryCode;
  final String name;
  final String icon;

  const MobileOperator(
    this.countryCode,
    this.name,
    this.icon,
  );
}

const List<MobileOperator> operators = [
  // Afghanistan
  MobileOperator('AF', 'Roshan', '📶'),
  MobileOperator('AF', 'Etisalat', '📱'),
  MobileOperator('AF', 'MTN', '📡'),
  MobileOperator('AF', 'AWCC', '🛰️'),
  MobileOperator('AF', 'Salaam', '☎️'),

  // Pakistan
  MobileOperator('PK', 'Jazz', '📶'),
  MobileOperator('PK', 'Zong', '📱'),
  MobileOperator('PK', 'Ufone', '📡'),
  MobileOperator('PK', 'Telenor', '☎️'),

  // India
  MobileOperator('IN', 'Airtel', '📶'),
  MobileOperator('IN', 'Jio', '📱'),
  MobileOperator('IN', 'Vi', '📡'),

  // Bangladesh
  MobileOperator('BD', 'Grameenphone', '📶'),
  MobileOperator('BD', 'Robi', '📱'),
  MobileOperator('BD', 'Banglalink', '☎️'),
];

// Suggested recharge amounts.
// Actual products and prices must be confirmed by the backend.
const Map<String, List<int>> rechargeAmounts = {
  'AFN': [100, 250, 500, 1000],
  'PKR': [500, 1000, 2000, 5000],
  'INR': [200, 500, 1000, 2000],
  'BDT': [200, 500, 1000, 2000],
};

// Transaction states
enum TransactionStatus {
  pending,
  successful,
  failed,
  underReview,
}

String statusLabel(
  TransactionStatus status,
  String languageCode,
) {
  switch (status) {
    case TransactionStatus.pending:
      return 'Pending';
    case TransactionStatus.successful:
      return 'Successful';
    case TransactionStatus.failed:
      return 'Failed';
    case TransactionStatus.underReview:
      return 'Under review';
  }
}

// Transaction data model
class TopUpTransaction {
  final String id;
  final String phone;
  final String countryCode;
  final String operatorName;
  final int amount;
  final String currency;
  final double fee;
  final double bonus;
  final TransactionStatus status;
  final DateTime createdAt;

  const TopUpTransaction({
    required this.id,
    required this.phone,
    required this.countryCode,
    required this.operatorName,
    required this.amount,
    required this.currency,
    required this.fee,
    required this.bonus,
    required this.status,
    required this.createdAt,
  });
}

// Safe phone formatting helper
String normalizePhone(String value) {
  return value.replaceAll(
    RegExp(r'[\s\-()]'),
    '',
  );
}

// Basic phone validation.
// Final validation must also happen on the server.
bool isValidPhone(
  String countryCode,
  String value,
) {
  final phone = normalizePhone(value);
  final digits = phone.startsWith('+')
      ? phone.substring(1)
      : phone;

  if (!RegExp(r'^\d+$').hasMatch(digits)) {
    return false;
  }

  switch (countryCode) {
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

// Euro display helper for values already denominated in cents.
String formatEuroCents(int cents) {
  return '€${(cents / 100).toStringAsFixed(2)}';
}
const Map<String, Map<String, String>> translations = {
  'ps': {
    'home': 'کور',
    'topup': 'موبایل چارج',
    'wallet': 'والټ',
    'history': 'د معاملاتو تاریخچه',
    'receipt': 'رسید',
    'support': 'مرسته',
    'profile': 'پروفایل',
    'settings': 'تنظیمات',
    'language': 'ژبه',
    'selectCountry': 'هېواد انتخاب کړئ',
    'selectOperator': 'شبکه انتخاب کړئ',
    'phone': 'د موبایل شمېره',
    'amount': 'د چارج اندازه',
    'price': 'بیه',
    'fee': 'فیس',
    'bonus': 'بونس',
    'total': 'ټوله بیه',
    'continue': 'تادیې ته دوام ورکړئ',
    'addMoney': 'والټ ته پیسې جمع کړئ',
    'balance': 'د والټ بیلانس',
    'transactionId': 'د معاملې نمبر',
    'pending': 'تر انتظار لاندې',
    'successful': 'بریالۍ',
    'failed': 'ناکامه',
    'review': 'تر ارزونې لاندې',
    'getHelp': 'مرسته وغواړئ',
    'faq': 'عامې پوښتنې',
    'contactSupport': 'له ملاتړ سره اړیکه',
    'notifications': 'خبرتیاوې',
    'security': 'امنیت',
    'welcome': 'ښه راغلاست',
    'noHistory': 'تر اوسه معامله نشته',
    'invalidPhone': 'د موبایل سمه شمېره ولیکئ',
    'chooseOperator': 'لومړی شبکه انتخاب کړئ',
    'loading': 'مهرباني وکړئ انتظار وکړئ...',
    'paymentError': 'تادیه پیل نه شوه. بیا هڅه وکړئ.',
    'priceNote': 'وروستۍ بیه به سرور تاییدوي',
    'securePayment': 'خوندي تادیه',
    'viewReceipt': 'رسید وګورئ',
    'shareReceipt': 'رسید شریک کړئ',
    'save': 'ثبتول',
    'cancel': 'لغوه کول',
    'retry': 'بیا هڅه',
  },

  'fa': {
    'home': 'خانه',
    'topup': 'شارژ موبایل',
    'wallet': 'کیف پول',
    'history': 'تاریخچه تراکنش‌ها',
    'receipt': 'رسید',
    'support': 'پشتیبانی',
    'profile': 'پروفایل',
    'settings': 'تنظیمات',
    'language': 'زبان',
    'selectCountry': 'کشور را انتخاب کنید',
    'selectOperator': 'شبکه را انتخاب کنید',
    'phone': 'شماره موبایل',
    'amount': 'مقدار شارژ',
    'price': 'قیمت',
    'fee': 'کارمزد',
    'bonus': 'بونوس',
    'total': 'مبلغ کل',
    'continue': 'ادامه پرداخت',
    'addMoney': 'افزودن پول به کیف پول',
    'balance': 'موجودی کیف پول',
    'transactionId': 'شماره تراکنش',
    'pending': 'در انتظار',
    'successful': 'موفق',
    'failed': 'ناموفق',
    'review': 'در حال بررسی',
    'getHelp': 'دریافت کمک',
    'faq': 'پرسش‌های متداول',
    'contactSupport': 'تماس با پشتیبانی',
    'notifications': 'اعلان‌ها',
    'security': 'امنیت',
    'welcome': 'خوش آمدید',
    'noHistory': 'هنوز تراکنشی وجود ندارد',
    'invalidPhone': 'شماره موبایل معتبر وارد کنید',
    'chooseOperator': 'ابتدا شبکه را انتخاب کنید',
    'loading': 'لطفاً صبر کنید...',
    'paymentError': 'پرداخت آغاز نشد. دوباره تلاش کنید.',
    'priceNote': 'قیمت نهایی توسط سرور تأیید می‌شود',
    'securePayment': 'پرداخت امن',
    'viewReceipt': 'مشاهده رسید',
    'shareReceipt': 'اشتراک‌گذاری رسید',
    'save': 'ذخیره',
    'cancel': 'لغو',
    'retry': 'تلاش دوباره',
  },

  'en': {
    'home': 'Home',
    'topup': 'Mobile Top-up',
    'wallet': 'Wallet',
    'history': 'Transaction History',
    'receipt': 'Receipt',
    'support': 'Support',
    'profile': 'Profile',
    'settings': 'Settings',
    'language': 'Language',
    'selectCountry': 'Select Country',
    'selectOperator': 'Select Operator',
    'phone': 'Mobile Number',
    'amount': 'Top-up Amount',
    'price': 'Price',
    'fee': 'Fee',
    'bonus': 'Bonus',
    'total': 'Total',
    'continue': 'Continue to Payment',
    'addMoney': 'Add Money',
    'balance': 'Wallet Balance',
    'transactionId': 'Transaction ID',
    'pending': 'Pending',
    'successful': 'Successful',
    'failed': 'Failed',
    'review': 'Under Review',
    'getHelp': 'Get Help',
    'faq': 'Frequently Asked Questions',
    'contactSupport': 'Contact Support',
    'notifications': 'Notifications',
    'security': 'Security',
    'welcome': 'Welcome',
    'noHistory': 'No transactions yet',
    'invalidPhone': 'Enter a valid mobile number',
    'chooseOperator': 'Please select an operator first',
    'loading': 'Please wait...',
    'paymentError': 'Could not start payment. Try again.',
    'priceNote': 'Final price is verified by the server',
    'securePayment': 'Secure Payment',
    'viewReceipt': 'View Receipt',
    'shareReceipt': 'Share Receipt',
    'save': 'Save',
    'cancel': 'Cancel',
    'retry': 'Retry',
  },

  'ur': {
    'home': 'ہوم',
    'topup': 'موبائل ریچارج',
    'wallet': 'والٹ',
    'history': 'لین دین کی تاریخ',
    'receipt': 'رسید',
    'support': 'مدد',
    'profile': 'پروفائل',
    'settings': 'ترتیبات',
    'language': 'زبان',
    'selectCountry': 'ملک منتخب کریں',
    'selectOperator': 'نیٹ ورک منتخب کریں',
    'phone': 'موبائل نمبر',
    'amount': 'ریچارج کی رقم',
    'price': 'قیمت',
    'fee': 'فیس',
    'bonus': 'بونس',
    'total': 'کل رقم',
    'continue': 'ادائیگی جاری رکھیں',
    'addMoney': 'والٹ میں رقم جمع کریں',
    'balance': 'والٹ بیلنس',
    'transactionId': 'لین دین نمبر',
    'pending': 'زیر انتظار',
    'successful': 'کامیاب',
    'failed': 'ناکام',
    'review': 'جائزے کے تحت',
    'getHelp': 'مدد حاصل کریں',
    'faq': 'عام سوالات',
    'contactSupport': 'سپورٹ سے رابطہ کریں',
    'notifications': 'اطلاعات',
    'security': 'سیکیورٹی',
    'welcome': 'خوش آمدید',
    'noHistory': 'ابھی کوئی لین دین نہیں',
    'invalidPhone': 'درست موبائل نمبر درج کریں',
    'chooseOperator': 'پہلے نیٹ ورک منتخب کریں',
    'loading': 'براہ کرم انتظار کریں...',
    'paymentError': 'ادائیگی شروع نہیں ہوئی۔ دوبارہ کوشش کریں۔',
    'priceNote': 'حتمی قیمت سرور تصدیق کرے گا',
    'securePayment': 'محفوظ ادائیگی',
    'viewReceipt': 'رسید دیکھیں',
    'shareReceipt': 'رسید شیئر کریں',
    'save': 'محفوظ کریں',
    'cancel': 'منسوخ کریں',
    'retry': 'دوبارہ کوشش',
  },

  'hi': {
    'home': 'होम',
    'topup': 'मोबाइल रिचार्ज',
    'wallet': 'वॉलेट',
    'history': 'लेन-देन इतिहास',
    'receipt': 'रसीद',
    'support': 'सहायता',
    'profile': 'प्रोफ़ाइल',
    'settings': 'सेटिंग्स',
    'language': 'भाषा',
    'selectCountry': 'देश चुनें',
    'selectOperator': 'नेटवर्क चुनें',
    'phone': 'मोबाइल नंबर',
    'amount': 'रिचार्ज राशि',
    'price': 'कीमत',
    'fee': 'शुल्क',
    'bonus': 'बोनस',
    'total': 'कुल राशि',
    'continue': 'भुगतान जारी रखें',
    'addMoney': 'वॉलेट में पैसे जोड़ें',
    'balance': 'वॉलेट बैलेंस',
    'transactionId': 'लेन-देन नंबर',
    'pending': 'लंबित',
    'successful': 'सफल',
    'failed': 'विफल',
    'review': 'जाँच जारी है',
    'getHelp': 'मदद लें',
    'faq': 'अक्सर पूछे जाने वाले प्रश्न',
    'contactSupport': 'सपोर्ट से संपर्क करें',
    'notifications': 'सूचनाएँ',
    'security': 'सुरक्षा',
    'welcome': 'स्वागत है',
    'noHistory': 'अभी कोई लेन-देन नहीं',
    'invalidPhone': 'सही मोबाइल नंबर दर्ज करें',
    'chooseOperator': 'पहले नेटवर्क चुनें',
    'loading': 'कृपया प्रतीक्षा करें...',
    'paymentError': 'भुगतान शुरू नहीं हुआ। फिर प्रयास करें।',
    'priceNote': 'अंतिम कीमत सर्वर सत्यापित करेगा',
    'securePayment': 'सुरक्षित भुगतान',
    'viewReceipt': 'रसीद देखें',
    'shareReceipt': 'रसीद साझा करें',
    'save': 'सहेजें',
    'cancel': 'रद्द करें',
    'retry': 'फिर कोशिश करें',
  },

  'bn': {
    'home': 'হোম',
    'topup': 'মোবাইল রিচার্জ',
    'wallet': 'ওয়ালেট',
    'history': 'লেনদেনের ইতিহাস',
    'receipt': 'রসিদ',
    'support': 'সহায়তা',
    'profile': 'প্রোফাইল',
    'settings': 'সেটিংস',
    'language': 'ভাষা',
    'selectCountry': 'দেশ নির্বাচন করুন',
    'selectOperator': 'নেটওয়ার্ক নির্বাচন করুন',
    'phone': 'মোবাইল নম্বর',
    'amount': 'রিচার্জের পরিমাণ',
    'price': 'মূল্য',
    'fee': 'ফি',
    'bonus': 'বোনাস',
    'total': 'মোট',
    'continue': 'পেমেন্ট চালিয়ে যান',
    'addMoney': 'ওয়ালেটে টাকা যোগ করুন',
    'balance': 'ওয়ালেট ব্যালেন্স',
    'transactionId': 'লেনদেন নম্বর',
    'pending': 'অপেক্ষমাণ',
    'successful': 'সফল',
    'failed': 'ব্যর্থ',
    'review': 'পর্যালোচনাধীন',
    'getHelp': 'সাহায্য নিন',
    'faq': 'সাধারণ প্রশ্ন',
    'contactSupport': 'সাপোর্টে যোগাযোগ করুন',
    'notifications': 'বিজ্ঞপ্তি',
    'security': 'নিরাপত্তা',
    'welcome': 'স্বাগতম',
    'noHistory': 'এখনও কোনো লেনদেন নেই',
    'invalidPhone': 'সঠিক মোবাইল নম্বর লিখুন',
    'chooseOperator': 'প্রথমে নেটওয়ার্ক নির্বাচন করুন',
    'loading': 'অনুগ্রহ করে অপেক্ষা করুন...',
    'paymentError': 'পেমেন্ট শুরু হয়নি। আবার চেষ্টা করুন।',
    'priceNote': 'চূড়ান্ত মূল্য সার্ভার যাচাই করবে',
    'securePayment': 'নিরাপদ পেমেন্ট',
    'viewReceipt': 'রসিদ দেখুন',
    'shareReceipt': 'রসিদ শেয়ার করুন',
    'save': 'সংরক্ষণ করুন',
    'cancel': 'বাতিল',
    'retry': 'আবার চেষ্টা করুন',
  },
};

String tr(String languageCode, String key) {
  return translations[languageCode]?[key] ??
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
          foregroundColor: brightGold,
          centerTitle: true,
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: cardWhite,
          elevation: 2,
          margin: const EdgeInsets.symmetric(vertical: 6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(18),
            side: const BorderSide(color: gold, width: 0.6),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 15,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
            borderSide: const BorderSide(color: gold),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
            borderSide: const BorderSide(
              color: primaryRed,
              width: 1.5,
            ),
          ),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: primaryRed,
            foregroundColor: brightGold,
            minimumSize: const Size(double.infinity, 52),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(15),
            ),
            textStyle: const TextStyle(
              fontWeight: FontWeight.bold,
              fontSize: 16,
            ),
          ),
        ),
      ),
      home: const PgntHomePage(),
    );
  }
}

class PgntLogo extends StatelessWidget {
  final double size;

  const PgntLogo({super.key, this.size = 62});

  @override
  Widget build(BuildContext context) {
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: darkRed,
        shape: BoxShape.circle,
        border: Border.all(
          color: brightGold,
          width: 2,
        ),
        boxShadow: [
          BoxShadow(
            color: gold.withValues(alpha: 0.30),
            blurRadius: 12,
            spreadRadius: 1,
          ),
        ],
      ),
      child: Icon(
        Icons.phone_android_rounded,
        size: size * 0.53,
        color: brightGold,
      ),
    );
  }
}

class PgntBrandHeader extends StatelessWidget {
  final String subtitle;

  const PgntBrandHeader({
    super.key,
    this.subtitle = 'Mobile Top-up & Wallet',
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          colors: [primaryRed, darkRed],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.all(Radius.circular(22)),
      ),
      child: Row(
        children: [
          const PgntLogo(size: 68),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PGNT ASIAN',
                  style: TextStyle(
                    color: brightGold,
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    letterSpacing: 1.1,
                  ),
                ),
                Text(
                  'TOPUP',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 16,
                    fontWeight: FontWeight.bold,
                    letterSpacing: 3,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  'Recharge • Wallet • Support',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 11,
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

Widget pgntSectionTitle(String title, IconData icon) {
  return Padding(
    padding: const EdgeInsets.only(bottom: 10, top: 8),
    child: Row(
      children: [
        Icon(icon, color: primaryRed, size: 22),
        const SizedBox(width: 9),
        Expanded(
          child: Text(
            title,
            style: const TextStyle(
              color: primaryRed,
              fontWeight: FontWeight.bold,
              fontSize: 17,
            ),
          ),
        ),
      ],
    ),
  );
}

Widget pgntGoldDivider() {
  return Container(
    height: 1,
    margin: const EdgeInsets.symmetric(vertical: 12),
    color: gold,
  );
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

  final List<TopUpTransaction> transactions = [];

  String t(String key) => tr(languageCode, key);

  List<MobileOperator> get countryOperators => operators
      .where((item) => item.countryCode == selectedCountry.code)
      .toList();

  List<int> get amounts =>
      rechargeAmounts[selectedCountry.currency] ?? [100, 250, 500];

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  void selectCountry(AppCountry? country) {
    if (country == null) return;

    setState(() {
      selectedCountry = country;
      selectedOperator = null;
      selectedAmount =
          (rechargeAmounts[country.currency] ?? [100]).first;
      phoneController.clear();
    });
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          appName,
          style: TextStyle(
            color: brightGold,
            fontWeight: FontWeight.bold,
          ),
        ),
        actions: [
          IconButton(
            tooltip: t('settings'),
            icon: const Icon(Icons.settings_outlined),
            onPressed: openSettings,
          ),
        ],
      ),
      body: IndexedStack(
        index: selectedTab,
        children: [
          buildHome(),
          buildHistory(),
          buildWallet(),
          buildSupport(),
          buildProfile(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: cream,
        indicatorColor: gold.withValues(alpha: 0.35),
        selectedIndex: selectedTab,
        onDestinationSelected: (index) {
          setState(() => selectedTab = index);
        },
        destinations: [
          NavigationDestination(
            icon: const Icon(Icons.home_outlined),
            selectedIcon: const Icon(Icons.home),
            label: t('home'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.receipt_long_outlined),
            selectedIcon: const Icon(Icons.receipt_long),
            label: t('history'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: const Icon(Icons.account_balance_wallet),
            label: t('wallet'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.support_agent_outlined),
            selectedIcon: const Icon(Icons.support_agent),
            label: t('support'),
          ),
          NavigationDestination(
            icon: const Icon(Icons.person_outline),
            selectedIcon: const Icon(Icons.person),
            label: t('profile'),
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
          const PgntBrandHeader(
            subtitle: 'Mobile Recharge • Wallet • Support',
          ),
          const SizedBox(height: 18),
          buildWelcomeCard(),
          const SizedBox(height: 18),
          pgntSectionTitle(t('selectCountry'), Icons.public),
          buildCountrySelector(),
          const SizedBox(height: 14),
          pgntSectionTitle(t('phone'), Icons.phone_android),
          buildPhoneField(),
          const SizedBox(height: 14),
          pgntSectionTitle(t('selectOperator'), Icons.signal_cellular_alt),
          buildOperatorSelector(),
          const SizedBox(height: 14),
          pgntSectionTitle(t('amount'), Icons.payments_outlined),
          buildAmountSelector(),
          const SizedBox(height: 14),
          buildPriceCard(),
          const SizedBox(height: 18),
          buildPaymentButton(),
          const SizedBox(height: 12),
          buildSecureNote(),
          const SizedBox(height: 22),
        ],
      ),
    );
  }

  Widget buildWelcomeCard() {
    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: darkRed,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: gold),
      ),
      child: Row(
        children: [
          const Icon(
            Icons.bolt,
            color: brightGold,
            size: 36,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t('welcome'),
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 5),
                const Text(
                  'Fast • Simple • Secure',
                  style: TextStyle(
                    color: brightGold,
                    fontSize: 17,
                    fontWeight: FontWeight.bold,
                  ),
                ),
              ],
            ),
          ),
          const Icon(
            Icons.verified_user_outlined,
            color: gold,
            size: 28,
          ),
        ],
      ),
    );
  }

  Widget buildCountrySelector() {
    return Wrap(
      spacing: 9,
      runSpacing: 9,
      children: countries.map((country) {
        final selected = country.code == selectedCountry.code;

        return ChoiceChip(
          avatar: Text(country.flag),
          label: Text(country.name),
          selected: selected,
          selectedColor: gold,
          backgroundColor: Colors.white,
          side: BorderSide(
            color: selected ? primaryRed : gold,
          ),
          labelStyle: TextStyle(
            color: selected ? primaryRed : Colors.black87,
            fontWeight: selected ? FontWeight.bold : FontWeight.normal,
          ),
          onSelected: (_) => selectCountry(country),
        );
      }).toList(),
    );
  }

  Widget buildPhoneField() {
    return TextField(
      controller: phoneController,
      keyboardType: TextInputType.phone,
      maxLength: 16,
      decoration: InputDecoration(
        hintText: '07XXXXXXXX',
        counterText: '',
        prefixIcon: const Icon(
          Icons.phone_android,
          color: primaryRed,
        ),
        suffixIcon: const Icon(
          Icons.shield_outlined,
          color: successGreen,
        ),
      ),
    );
  }

  Widget buildOperatorSelector() {
    return DropdownButtonFormField<MobileOperator>(
      value: selectedOperator,
      isExpanded: true,
      decoration: const InputDecoration(
        prefixIcon: Icon(
          Icons.sim_card_outlined,
          color: primaryRed,
        ),
      ),
      hint: Text(t('selectOperator')),
      items: countryOperators.map((item) {
        return DropdownMenuItem<MobileOperator>(
          value: item,
          child: Text('${item.icon}  ${item.name}'),
        );
      }).toList(),
      onChanged: (value) {
        setState(() => selectedOperator = value);
      },
    );
  }

  Widget buildAmountSelector() {
    return Wrap(
      spacing: 10,
      runSpacing: 10,
      children: amounts.map((amount) {
        final selected = selectedAmount == amount;

        return ChoiceChip(
          label: Text('$amount ${selectedCountry.currency}'),
          selected: selected,
          selectedColor: gold,
          backgroundColor: Colors.white,
          side: BorderSide(
            color: selected ? primaryRed : gold,
          ),
          labelStyle: TextStyle(
            color: selected ? primaryRed : Colors.black87,
            fontWeight: FontWeight.bold,
          ),
          onSelected: (_) {
            setState(() => selectedAmount = amount);
          },
        );
      }).toList(),
    );
  }

  Widget buildPriceCard() {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              children: [
                const Icon(Icons.price_check, color: primaryRed),
                const SizedBox(width: 10),
                Expanded(child: Text(t('price'))),
                Text(
                  '$selectedAmount ${selectedCountry.currency}',
                  style: const TextStyle(fontWeight: FontWeight.bold),
                ),
              ],
            ),
            pgntGoldDivider(),
            Row(
              children: [
                const Icon(Icons.receipt_outlined, color: primaryRed),
                const SizedBox(width: 10),
                Expanded(child: Text(t('fee'))),
                const Text('—'),
              ],
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Icon(Icons.card_giftcard, color: primaryRed),
                const SizedBox(width: 10),
                Expanded(child: Text(t('bonus'))),
                const Text('—'),
              ],
            ),
            const SizedBox(height: 12),
            const Text(
              'بیه، فیس او بونس به له سرور څخه تایید شي.',
              style: TextStyle(
                color: Colors.black54,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget buildPaymentButton() {
    return ElevatedButton.icon(
      onPressed: isLoading ? null : startPayment,
      icon: isLoading
          ? const SizedBox(
              height: 20,
              width: 20,
              child: CircularProgressIndicator(
                strokeWidth: 2,
                color: brightGold,
              ),
            )
          : const Icon(Icons.lock_outline),
      label: Text(
        isLoading ? t('loading') : t('continue'),
      ),
    );
  }

  Widget buildSecureNote() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        const Icon(
          Icons.verified_user_outlined,
          color: successGreen,
          size: 18,
        ),
        const SizedBox(width: 7),
        Text(
          t('securePayment'),
          style: const TextStyle(color: Colors.black54),
        ),
      ],
    );
  }
  
  Future<void> startPayment() async {
    final phone = normalizePhone(phoneController.text);

    if (!isValidPhone(selectedCountry.code, phone)) {
      showMessage(t('invalidPhone'));
      return;
    }

    if (selectedOperator == null) {
      showMessage(t('chooseOperator'));
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
            headers: const {
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
              'currency': selectedCountry.currency,
            }),
          )
          .timeout(const Duration(seconds: 30));

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception('Checkout request failed');
      }

      final dynamic decoded = jsonDecode(response.body);

      if (decoded is! Map<String, dynamic>) {
        throw Exception('Invalid checkout response');
      }

      final dynamic rawUrl = decoded['checkoutUrl'] ??
          decoded['url'] ??
          decoded['sessionUrl'];

      if (rawUrl is! String || rawUrl.isEmpty) {
        throw Exception('Checkout URL is missing');
      }

      final paymentUri = Uri.tryParse(rawUrl);

      if (paymentUri == null || paymentUri.scheme != 'https') {
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
        transactions.insert(
          0,
          TopUpTransaction(
            id: 'PENDING-${DateTime.now().millisecondsSinceEpoch}',
            phone: phone,
            countryCode: selectedCountry.code,
            operatorName: selectedOperator!.name,
            amount: selectedAmount,
            currency: selectedCountry.currency,
            fee: 0,
            bonus: 0,
            status: TransactionStatus.pending,
            createdAt: DateTime.now(),
          ),
        );
      });

      showMessage(t('success'));
    } catch (_) {
      showMessage(t('paymentError'));
    } finally {
      if (mounted) {
        setState(() => isLoading = false);
      }
    }
  }

  Widget buildHistory() {
    return SafeArea(
      child: transactions.isEmpty
          ? Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.receipt_long_outlined,
                    size: 64,
                    color: gold,
                  ),
                  const SizedBox(height: 14),
                  Text(t('noHistory')),
                ],
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: transactions.length,
              itemBuilder: (context, index) {
                final item = transactions[index];

                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: cream,
                      child: Icon(
                        Icons.phone_android,
                        color: primaryRed,
                      ),
                    ),
                    title: Text(item.operatorName),
                    subtitle: Text(
                      '${item.phone}\n'
                      '${t('transactionId')}: ${item.id}',
                    ),
                    isThreeLine: true,
                    trailing: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(
                          '${item.amount} ${item.currency}',
                          style: const TextStyle(
                            color: primaryRed,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        Text(
                          t(statusLabel(item.status, languageCode)),
                          style: const TextStyle(fontSize: 11),
                        ),
                      ],
                    ),
                    onTap: () => showReceipt(item),
                  ),
                );
              },
            ),
    );
  }

  void showReceipt(TopUpTransaction item) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: pageBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(22),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Center(child: PgntLogo(size: 66)),
                const SizedBox(height: 12),
                const Center(
                  child: Text(
                    'PGNT ASIAN TOPUP',
                    style: TextStyle(
                      color: primaryRed,
                      fontSize: 20,
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                ),
                const SizedBox(height: 6),
                Center(child: Text(t('receipt'))),
                pgntGoldDivider(),
                receiptRow(t('transactionId'), item.id),
                receiptRow(t('phone'), item.phone),
                receiptRow(t('selectOperator'), item.operatorName),
                receiptRow(
                  t('amount'),
                  '${item.amount} ${item.currency}',
                ),
                receiptRow(
                  t('fee'),
                  item.fee.toStringAsFixed(2),
                ),
                receiptRow(
                  t('bonus'),
                  item.bonus.toStringAsFixed(2),
                ),
                receiptRow(
                  t('history'),
                  t(statusLabel(item.status, languageCode)),
                ),
                const SizedBox(height: 18),
                OutlinedButton.icon(
                  onPressed: () {
                    Navigator.pop(context);
                    showMessage(
                      'د رسید شریکولو ځانګړنه به په راتلونکي پړاو کې ورزیاته شي.',
                    );
                  },
                  icon: const Icon(Icons.share_outlined),
                  label: Text(t('shareReceipt')),
                ),
                const SizedBox(height: 10),
              ],
            ),
          ),
        );
      },
    );
  }

  Widget receiptRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: Colors.black54),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.end,
              style: const TextStyle(
                fontWeight: FontWeight.bold,
              ),
            ),
          ),
        ],
      ),
    );
  }
  
  Widget buildWallet() {
    return SafeArea(
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const PgntBrandHeader(
            subtitle: 'Wallet • Payments • Balance',
          ),
          const SizedBox(height: 20),

          pgntSectionTitle(
            t('wallet'),
            Icons.account_balance_wallet,
          ),

          Container(
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [primaryRed, darkRed],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(
                color: brightGold,
                width: 1.4,
              ),
              boxShadow: [
                BoxShadow(
                  color: primaryRed.withValues(alpha: 0.18),
                  blurRadius: 16,
                  offset: const Offset(0, 7),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(
                      Icons.account_balance_wallet,
                      color: brightGold,
                      size: 30,
                    ),
                    SizedBox(width: 10),
                    Text(
                      'PGNT WALLET',
                      style: TextStyle(
                        color: brightGold,
                        fontWeight: FontWeight.bold,
                        letterSpacing: 1.2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 24),
                Text(
                  t('balance'),
                  style: const TextStyle(
                    color: Colors.white70,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '— EUR',
                  style: TextStyle(
                    color: brightGold,
                    fontSize: 32,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'د حقیقي بیلانس لپاره د سرور اتصال اړین دی.',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
                  ),
                ),
              ],
            ),
          ),

          const SizedBox(height: 20),

          ElevatedButton.icon(
            onPressed: () => showMessage(
              'د پیسو جمع کولو لپاره د والټ API او د تادیې تایید اړین دي.',
            ),
            icon: const Icon(Icons.add_circle_outline),
            label: Text(t('addMoney')),
          ),

          const SizedBox(height: 12),

          Card(
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: cream,
                child: Icon(
                  Icons.credit_card,
                  color: primaryRed,
                ),
              ),
              title: const Text('Stripe'),
              subtitle: const Text(
                'د موجود Backend له لارې تادیه',
              ),
              trailing: const Icon(Icons.lock_outline),
              onTap: () => showMessage(
                'Stripe تادیه باید د سرور له خوا تایید شي.',
              ),
            ),
          ),

          Card(
            child: ListTile(
              leading: const CircleAvatar(
                backgroundColor: cream,
                child: Icon(
                  Icons.history,
                  color: primaryRed,
                ),
              ),
              title: Text(t('history')),
              subtitle: const Text(
                'د والټ د داخلېدو او وتلو معاملې',
              ),
              trailing: const Icon(Icons.chevron_right),
              onTap: () {
                setState(() => selectedTab = 1);
              },
            ),
          ),

          const SizedBox(height: 16),

          pgntSectionTitle(
            'د والټ امنیت',
            Icons.shield_outlined,
          ),

          const Card(
            child: ListTile(
              leading: Icon(
                Icons.verified_user_outlined,
                color: successGreen,
              ),
              title: Text('خوندي تادیات'),
              subtitle: Text(
                'د تادیې پټ کلیدونه باید یوازې په Backend کې وي.',
              ),
            ),
          ),
        ],
      ),
    );
  }
  
  Widget buildSupport() {
    final faqs = <Map<String, String>>[
      {
        'q': 'How can I check my top-up?',
        'a': 'Open History and check the transaction status or receipt.',
      },
      {
        'q': 'What if my top-up fails?',
        'a': 'Keep your transaction ID and contact support for review.',
      },
      {
        'q': 'When will my payment be confirmed?',
        'a': 'Payment confirmation depends on the verified payment status.',
      },
      {
        'q': 'Is my payment secure?',
        'a': 'Never share your password, card PIN, or security codes.',
      },
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const PgntBrandHeader(),
        const SizedBox(height: 20),
        pgntSectionTitle(
          t('support'),
          Icons.support_agent_rounded,
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              colors: [primaryRed, darkRed],
            ),
            borderRadius: BorderRadius.circular(20),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Icon(
                Icons.headset_mic_rounded,
                color: gold,
                size: 38,
              ),
              const SizedBox(height: 10),
              Text(
                t('getHelp'),
                style: const TextStyle(
                  color: Colors.white,
                  fontSize: 20,
                  fontWeight: FontWeight.bold,
                ),
              ),
              const SizedBox(height: 8),
              const Text(
                'Find answers about payments, top-ups and transactions.',
                style: TextStyle(color: Colors.white70),
              ),
              const SizedBox(height: 14),
              SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  onPressed: () {
                    showMessage(
                      'Support contact is not connected yet. '
                      'Configure a real support email or support API.',
                    );
                  },
                  icon: const Icon(Icons.mail_outline),
                  label: Text(t('contactSupport')),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: gold,
                    side: const BorderSide(color: gold),
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 22),
        pgntSectionTitle(
          t('faq'),
          Icons.question_answer_outlined,
        ),
        const SizedBox(height: 8),
        ...faqs.map(
          (faq) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ExpansionTile(
              leading: const Icon(
                Icons.help_outline,
                color: primaryRed,
              ),
              title: Text(
                faq['q']!,
                style: const TextStyle(
                  fontWeight: FontWeight.w600,
                ),
              ),
              childrenPadding: const EdgeInsets.fromLTRB(
                16, 0, 16, 16,
              ),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(faq['a']!),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        const Center(
          child: Text(
            'PGNT ASIAN TOPUP • Support',
            style: TextStyle(color: Colors.grey),
          ),
        ),
      ],
    );
  }

  Widget buildProfile() {
    final currentLanguage = languages.firstWhere(
      (item) => item.code == languageCode,
      orElse: () => languages.first,
    );

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const PgntBrandHeader(),
        const SizedBox(height: 20),
        Center(
          child: Column(
            children: [
              Container(
                width: 86,
                height: 86,
                decoration: BoxDecoration(
                  color: primaryRed,
                  shape: BoxShape.circle,
                  border: Border.all(
                    color: gold,
                    width: 3,
                  ),
                ),
                child: const Icon(
                  Icons.person_outline_rounded,
                  color: gold,
                  size: 46,
                ),
              ),
              const SizedBox(height: 12),
              const Text(
                'PGNT ASIAN USER',
                style: TextStyle(
                  fontSize: 19,
                  fontWeight: FontWeight.bold,
                  color: primaryRed,
                ),
              ),
              const SizedBox(height: 4),
              const Text(
                'Guest account',
                style: TextStyle(color: Colors.grey),
              ),
            ],
          ),
        ),
        const SizedBox(height: 24),
        pgntSectionTitle(
          t('profile'),
          Icons.person_outline,
        ),
        Card(
          child: ListTile(
            leading: const Icon(
              Icons.translate,
              color: primaryRed,
            ),
            title: Text(t('language')),
            subtitle: Text(currentLanguage.nativeName),
            trailing: const Icon(Icons.chevron_right),
            onTap: openSettings,
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(
              Icons.receipt_long_outlined,
              color: primaryRed,
            ),
            title: Text(t('history')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              setState(() => selectedTab = 1);
            },
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(
              Icons.account_balance_wallet_outlined,
              color: primaryRed,
            ),
            title: Text(t('wallet')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              setState(() => selectedTab = 2);
            },
          ),
        ),
        const SizedBox(height: 18),
        pgntSectionTitle(
          t('settings'),
          Icons.settings_outlined,
        ),
        Card(
          child: ListTile(
            leading: const Icon(
              Icons.lock_outline,
              color: primaryRed,
            ),
            title: Text(t('security')),
            subtitle: const Text(
              'Account security features require account setup.',
            ),
            onTap: () {
              showMessage(
                'Account security is not connected yet.',
              );
            },
          ),
        ),
        Card(
          child: ListTile(
            leading: const Icon(
              Icons.support_agent,
              color: primaryRed,
            ),
            title: Text(t('support')),
            trailing: const Icon(Icons.chevron_right),
            onTap: () {
              setState(() => selectedTab = 3);
            },
          ),
        ),
        const SizedBox(height: 18),
        const Center(
          child: Text(
            'Version 1.0.0',
            style: TextStyle(color: Colors.grey),
          ),
        ),
      ],
    );
  }

  void openSettings() {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: pageBg,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(24),
        ),
      ),
      builder: (sheetContext) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    const Icon(
                      Icons.translate,
                      color: primaryRed,
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        t('language'),
                        style: const TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.bold,
                          color: primaryRed,
                        ),
                      ),
                    ),
                    IconButton(
                      onPressed: () =>
                          Navigator.pop(sheetContext),
                      icon: const Icon(Icons.close),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                ...languages.map(
                  (language) => RadioListTile<String>(
                    value: language.code,
                    groupValue: languageCode,
                    activeColor: primaryRed,
                    title: Text(language.nativeName),
                    subtitle: Text(language.name),
                    onChanged: (value) {
                      if (value == null) return;
                      setState(() {
                        languageCode = value;
                      });
                      Navigator.pop(sheetContext);
                    },
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
  
}
