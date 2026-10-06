import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PGNTApp());
}

// ========================================================
// ۱. د ثابت ارزښتونو کلاس
// ========================================================
class AppConstants {
  // ===== ستاسو د بیک انډ URL =====
  // د ازموینې لپاره: http://localhost:3000
  // که خپور کړی وي: https://your-server.com
  static const String backendUrl = 'https://pgnt-asian-backend.onrender.com';

  // ===== تنظیمات =====
  static const double feePercentage = 0.02;
  static const double bonusPercentage = 0.10;
  static const Map<String, int> countryDialCodes = {
    'AF': 93,
    'PK': 92,
    'BD': 880,
    'IN': 91,
  };
}

// ========================================================
// ۲. د هیواد او آپریټر ماډلونه
// ========================================================
class OperatorInfo {
  final String name;
  final int dtOneOperatorId;
  const OperatorInfo({required this.name, required this.dtOneOperatorId});
}

class CountryInfo {
  final String code;
  final String nameEn;
  final String flag;
  final List<OperatorInfo> operators;
  const CountryInfo({
    required this.code,
    required this.nameEn,
    required this.flag,
    required this.operators,
  });
}

final List<CountryInfo> supportedCountries = [
  const CountryInfo(
    code: 'AF', nameEn: 'Afghanistan', flag: '🇦🇫',
    operators: [
      OperatorInfo(name: 'Roshan', dtOneOperatorId: 1037),
      OperatorInfo(name: 'Etisalat', dtOneOperatorId: 1038),
      OperatorInfo(name: 'MTN', dtOneOperatorId: 1039),
      OperatorInfo(name: 'AWCC', dtOneOperatorId: 1040),
    ],
  ),
  const CountryInfo(
    code: 'PK', nameEn: 'Pakistan', flag: '🇵🇰',
    operators: [
      OperatorInfo(name: 'Jazz', dtOneOperatorId: 2001),
      OperatorInfo(name: 'Zong', dtOneOperatorId: 2002),
      OperatorInfo(name: 'Telenor', dtOneOperatorId: 2003),
      OperatorInfo(name: 'Ufone', dtOneOperatorId: 2004),
    ],
  ),
  const CountryInfo(
    code: 'BD', nameEn: 'Bangladesh', flag: '🇧🇩',
    operators: [
      OperatorInfo(name: 'Grameenphone', dtOneOperatorId: 3001),
      OperatorInfo(name: 'Robi', dtOneOperatorId: 3002),
      OperatorInfo(name: 'Banglalink', dtOneOperatorId: 3003),
      OperatorInfo(name: 'Airtel', dtOneOperatorId: 3004),
    ],
  ),
  const CountryInfo(
    code: 'IN', nameEn: 'India', flag: '🇮🇳',
    operators: [
      OperatorInfo(name: 'Airtel', dtOneOperatorId: 4001),
      OperatorInfo(name: 'Jio', dtOneOperatorId: 4002),
      OperatorInfo(name: 'Vi', dtOneOperatorId: 4003),
      OperatorInfo(name: 'BSNL', dtOneOperatorId: 4004),
    ],
  ),
];

// ========================================================
// ۳. د ټرانزکشن ماډل
// ========================================================
enum TransactionStatus { pending, completed, failed, created }

class AppTransaction {
  final String id;
  final String orderId;
  final String countryCode;
  final String operator;
  final String phoneNumber;
  final double amount;
  final double fee;
  final double total;
  final double bonus;
  final String paymentMethod;
  final TransactionStatus status;
  final DateTime date;
  final int? dtOneTransactionId;

  AppTransaction({
    required this.id,
    required this.orderId,
    required this.countryCode,
    required this.operator,
    required this.phoneNumber,
    required this.amount,
    required this.fee,
    required this.total,
    required this.bonus,
    required this.paymentMethod,
    required this.status,
    required this.date,
    this.dtOneTransactionId,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'orderId': orderId,
        'countryCode': countryCode,
        'operator': operator,
        'phoneNumber': phoneNumber,
        'amount': amount,
        'fee': fee,
        'total': total,
        'bonus': bonus,
        'paymentMethod': paymentMethod,
        'status': status.name,
        'date': date.toIso8601String(),
        'dtOneTransactionId': dtOneTransactionId,
      };

  factory AppTransaction.fromJson(Map<String, dynamic> json) => AppTransaction(
        id: json['id'],
        orderId: json['orderId'],
        countryCode: json['countryCode'],
        operator: json['operator'],
        phoneNumber: json['phoneNumber'],
        amount: (json['amount'] as num).toDouble(),
        fee: (json['fee'] as num).toDouble(),
        total: (json['total'] as num).toDouble(),
        bonus: (json['bonus'] as num).toDouble(),
        paymentMethod: json['paymentMethod'],
        status: TransactionStatus.values.firstWhere(
          (s) => s.name == json['status'],
          orElse: () => TransactionStatus.pending,
        ),
        date: DateTime.parse(json['date']),
        dtOneTransactionId: json['dtOneTransactionId'],
      );
}

// ========================================================
// ۴. د ژبو ژباړې
// ========================================================
class AppStrings {
  final Locale locale;
  AppStrings(this.locale);

  static AppStrings of(BuildContext context) =>
      Localizations.of<AppStrings>(context, AppStrings)!;

  static const LocalizationsDelegate<AppStrings> delegate =
      _AppStringsDelegate();

  static final Map<String, Map<String, String>> _v = {
    'en': {
      'appTitle': 'PGNT Asian Topup',
      'selectLanguage': 'Select Language',
      'continue': 'Continue',
      'walletBalance': 'Wallet Balance',
      'addMoney': 'Add Money',
      'phoneNumber': 'Phone Number',
      'selectAmount': 'Select Amount',
      'selectCountry': 'Select Country',
      'selectOperator': 'Select Operator',
      'confirmTopup': 'Confirm Top-Up',
      'amount': 'Amount',
      'bonus': 'Bonus',
      'total': 'Total',
      'fee': 'Fee',
      'payWithStripe': 'Pay with Stripe',
      'payWithHesabPay': 'Pay with HesabPay',
      'topupSuccessful': 'Top-Up Successful!',
      'successMessage': 'Your top-up has been sent.',
      'home': 'Home',
      'history': 'History',
      'wallet': 'Wallet',
      'profile': 'Profile',
      'paymentMethod': 'Payment Method',
      'cancel': 'Cancel',
      'payNow': 'Pay Now',
      'orderId': 'Order ID',
      'date': 'Date',
      'status': 'Status',
      'completed': 'Completed',
      'pending': 'Pending',
      'failed': 'Failed',
      'newTopup': 'New Top-Up',
      'error': 'Error',
      'noTransactions': 'No transactions yet',
      'myProfile': 'My Profile',
      'referralLink': 'My Referral Link',
      'language': 'Language',
      'support': 'Support',
      'faq': 'FAQ',
      'terms': 'Terms & Conditions',
      'privacy': 'Privacy Policy',
      'logout': 'Logout',
      'openingPayment': 'Opening payment page...',
    },
    'ps': {
      'appTitle': 'PGNT آسیایي ټاپ اپ',
      'selectLanguage': 'ژبه وټاکئ',
      'continue': 'دوام ورکړئ',
      'walletBalance': 'د والټ بیلانس',
      'addMoney': 'پیسي اضافه کړئ',
      'phoneNumber': 'د تلیفون شمېره',
      'selectAmount': 'مقدار وټاکئ',
      'selectCountry': 'هیواد وټاکئ',
      'selectOperator': 'آپریټر وټاکئ',
      'confirmTopup': 'ټاپ-اپ تایید کړئ',
      'amount': 'مقدار',
      'bonus': 'بونس',
      'total': 'ټول',
      'fee': 'فیس',
      'payWithStripe': 'د Stripe سره تادیه وکړئ',
      'payWithHesabPay': 'د حساب پي سره تادیه وکړئ',
      'topupSuccessful': 'ټاپ-اپ بریالی شو!',
      'successMessage': 'ستاسو ټاپ-اپ لیږل شوی.',
      'home': 'کور',
      'history': 'تاریخچه',
      'wallet': 'والټ',
      'profile': 'پروفایل',
      'paymentMethod': 'د تادیې میتود',
      'cancel': 'لغوه کړئ',
      'payNow': 'اوس تادیه وکړئ',
      'orderId': 'د امر شمېره',
      'date': 'نیټه',
      'status': 'حالت',
      'completed': 'بشپړ شو',
      'pending': 'پاتې',
      'failed': 'ناکام',
      'newTopup': 'نوی ټاپ-اپ',
      'error': 'تېروتنه',
      'noTransactions': 'تر اوسه هیڅ ټرانزکشن نشته',
      'myProfile': 'زما پروفایل',
      'referralLink': 'زما ریفرل لینک',
      'language': 'ژبه',
      'support': 'ملاتړ',
      'faq': 'عامې پوښتنې',
      'terms': 'شرایط او مقررات',
      'privacy': 'د محرمیت تګلاره',
      'logout': 'وتل',
      'openingPayment': 'د تادیې پاڼه پرانیستل کیږي...',
    },
    'fa': {
      'appTitle': 'PGNT آسیایی تاپ آپ',
      'selectLanguage': 'انتخاب زبان',
      'continue': 'ادامه',
      'walletBalance': 'موجودی کیف پول',
      'addMoney': 'افزودن پول',
      'phoneNumber': 'شماره تلفن',
      'selectAmount': 'انتخاب مقدار',
      'selectCountry': 'انتخاب کشور',
      'selectOperator': 'انتخاب اپراتور',
      'confirmTopup': 'تایید تاپ آپ',
      'amount': 'مقدار',
      'bonus': 'بونس',
      'total': 'مجموع',
      'fee': 'فیس',
      'payWithStripe': 'پرداخت با Stripe',
      'payWithHesabPay': 'پرداخت با حساب پی',
      'topupSuccessful': 'تاپ آپ موفق!',
      'successMessage': 'تاپ آپ شما ارسال شد.',
      'home': 'خانه',
      'history': 'تاریخچه',
      'wallet': 'کیف پول',
      'profile': 'پروفایل',
      'paymentMethod': 'روش پرداخت',
      'cancel': 'لغو',
      'payNow': 'پرداخت کنید',
      'orderId': 'شماره سفارش',
      'date': 'تاریخ',
      'status': 'وضعیت',
      'completed': 'تکمیل شد',
      'pending': 'در انتظار',
      'failed': 'ناکام',
      'newTopup': 'تاپ آپ جدید',
      'error': 'خطا',
      'noTransactions': 'هنوز تراکنشی نیست',
      'myProfile': 'پروفایل من',
      'referralLink': 'لینک معرف من',
      'language': 'زبان',
      'support': 'پشتیبانی',
      'faq': 'سوالات متداول',
      'terms': 'شرایط و مقررات',
      'privacy': 'سیاست حفظ حریم خصوصی',
      'logout': 'خروج',
      'openingPayment': 'در حال باز کردن صفحه پرداخت...',
    },
    'ur': {
      'appTitle': 'PGNT ایشین ٹاپ اپ',
      'selectLanguage': 'زبان منتخب کریں',
      'continue': 'جاری رکھیں',
      'walletBalance': 'والٹ بیلنس',
      'addMoney': 'پیسے شامل کریں',
      'phoneNumber': 'فون نمبر',
      'selectAmount': 'رقم منتخب کریں',
      'selectCountry': 'ملک منتخب کریں',
      'selectOperator': 'آپریٹر منتخب کریں',
      'confirmTopup': 'ٹاپ اپ کی تصدیق',
      'amount': 'رقم',
      'bonus': 'بونس',
      'total': 'کل',
      'fee': 'فیس',
      'payWithStripe': 'Stripe سے ادائیگی',
      'payWithHesabPay': 'حساب پے سے ادائیگی',
      'topupSuccessful': 'ٹاپ اپ کامیاب!',
      'successMessage': 'آپ کا ٹاپ اپ بھیج دیا گیا۔',
      'home': 'ہوم',
      'history': 'تاریخ',
      'wallet': 'والٹ',
      'profile': 'پروفائل',
      'paymentMethod': 'ادائیگی کا طریقہ',
      'cancel': 'منسوخ',
      'payNow': 'ابھی ادا کریں',
      'orderId': 'آرڈر آئی ڈی',
      'date': 'تاریخ',
      'status': 'حالت',
      'completed': 'مکمل',
      'pending': 'زیر التواء',
      'failed': 'ناکام',
      'newTopup': 'نیا ٹاپ اپ',
      'error': 'خرابی',
      'noTransactions': 'ابھی کوئی لین دین نہیں',
      'myProfile': 'میرا پروفائل',
      'referralLink': 'میرا ریفرل لنک',
      'language': 'زبان',
      'support': 'مدد',
      'faq': 'عام سوالات',
      'terms': 'شرائط و ضوابط',
      'privacy': 'رازداری کی پالیسی',
      'logout': 'لاگ آؤٹ',
      'openingPayment': 'ادائیگی کا صفحہ کھل رہا ہے...',
    },
    'hi': {
      'appTitle': 'PGNT एशियन टॉपअप',
      'selectLanguage': 'भाषा चुनें',
      'continue': 'जारी रखें',
      'walletBalance': 'वॉलेट बैलेंस',
      'addMoney': 'पैसे जोड़ें',
      'phoneNumber': 'फ़ोन नंबर',
      'selectAmount': 'राशि चुनें',
      'selectCountry': 'देश चुनें',
      'selectOperator': 'ऑपरेटर चुनें',
      'confirmTopup': 'टॉप-अप की पुष्टि',
      'amount': 'राशि',
      'bonus': 'बोनस',
      'total': 'कुल',
      'fee': 'शुल्क',
      'payWithStripe': 'Stripe से भुगतान',
      'payWithHesabPay': 'HesabPay से भुगतान',
      'topupSuccessful': 'टॉप-अप सफल!',
      'successMessage': 'आपका टॉप-अप भेज दिया गया।',
      'home': 'होम',
      'history': 'इतिहास',
      'wallet': 'वॉलेट',
      'profile': 'प्रोफ़ाइल',
      'paymentMethod': 'भुगतान का तरीका',
      'cancel': 'रद्द करें',
      'payNow': 'अभी भुगतान करें',
      'orderId': 'ऑर्डर आईडी',
      'date': 'तारीख',
      'status': 'स्थिति',
      'completed': 'पूरा हुआ',
      'pending': 'लंबित',
      'failed': 'विफल',
      'newTopup': 'नया टॉप-अप',
      'error': 'त्रुटि',
      'noTransactions': 'अभी तक कोई लेनदेन नहीं',
      'myProfile': 'मेरी प्रोफ़ाइल',
      'referralLink': 'मेरा रेफ़रल लिंक',
      'language': 'भाषा',
      'support': 'समर्थन',
      'faq': 'सामान्य प्रश्न',
      'terms': 'नियम और शर्तें',
      'privacy': 'गोपनीयता नीति',
      'logout': 'लॉग आउट',
      'openingPayment': 'भुगतान पृष्ठ खुल रहा है...',
    },
    'bn': {
      'appTitle': 'PGNT এশিয়ান টপআপ',
      'selectLanguage': 'ভাষা নির্বাচন করুন',
      'continue': 'চালিয়ে যান',
      'walletBalance': 'ওয়ালেট ব্যালেন্স',
      'addMoney': 'টাকা যোগ করুন',
      'phoneNumber': 'ফোন নম্বর',
      'selectAmount': 'পরিমাণ নির্বাচন করুন',
      'selectCountry': 'দেশ নির্বাচন করুন',
      'selectOperator': 'অপারেটর নির্বাচন করুন',
      'confirmTopup': 'টপ-আপ নিশ্চিত করুন',
      'amount': 'পরিমাণ',
      'bonus': 'বোনাস',
      'total': 'মোট',
      'fee': 'ফি',
      'payWithStripe': 'Stripe দিয়ে পেমেন্ট',
      'payWithHesabPay': 'HesabPay দিয়ে পেমেন্ট',
      'topupSuccessful': 'টপ-আপ সফল!',
      'successMessage': 'আপনার টপ-আপ পাঠানো হয়েছে।',
      'home': 'হোম',
      'history': 'ইতিহাস',
      'wallet': 'ওয়ালেট',
      'profile': 'প্রোফাইল',
      'paymentMethod': 'পেমেন্ট পদ্ধতি',
      'cancel': 'বাতিল',
      'payNow': 'এখনই পরিশোধ করুন',
      'orderId': 'অর্ডার আইডি',
      'date': 'তারিখ',
      'status': 'স্ট্যাটাস',
      'completed': 'সম্পন্ন',
      'pending': 'মুলতুবি',
      'failed': 'ব্যর্থ',
      'newTopup': 'নতুন টপ-আপ',
      'error': 'ত্রুটি',
      'noTransactions': 'এখনো কোন লেনদেন নেই',
      'myProfile': 'আমার প্রোফাইল',
      'referralLink': 'আমার রেফারেল লিংক',
      'language': 'ভাষা',
      'support': 'সহায়তা',
      'faq': 'সাধারণ প্রশ্ন',
      'terms': 'শর্তাবলী',
      'privacy': 'গোপনীয়তা নীতি',
      'logout': 'লগ আউট',
      'openingPayment': 'পেমেন্ট পৃষ্ঠা খোলা হচ্ছে...',
    },
  };

  String get(String key) =>
      _v[locale.languageCode]?[key] ?? _v['en']![key] ?? key;
}

class _AppStringsDelegate extends LocalizationsDelegate<AppStrings> {
  const _AppStringsDelegate();
  @override
  bool isSupported(Locale locale) =>
      ['en', 'ps', 'fa', 'ur', 'hi', 'bn'].contains(locale.languageCode);
  @override
  Future<AppStrings> load(Locale locale) async => AppStrings(locale);
  @override
  bool shouldReload(_AppStringsDelegate old) => false;
}

// ========================================================
// ۵. د بیک انډ سروس (Backend Service)
// ========================================================
class BackendService {
  // ===== د Stripe Checkout سیشن جوړول =====
  Future<Map<String, dynamic>> createStripeCheckout({
    required double amount,
    required String currency,
    required String orderId,
    required String successUrl,
    required String cancelUrl,
    required String countryCode,
    required String operator,
    required int operatorId,
    required String phoneNumber,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConstants.backendUrl}/api/payments/checkout'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        'currency': currency,
        'orderId': orderId,
        'successUrl': successUrl,
        'cancelUrl': cancelUrl,
        'countryCode': countryCode,
        'operator': operator,
        'operatorId': operatorId,
        'phoneNumber': phoneNumber,
      }),
    );

    if (r.statusCode == 200 || r.statusCode == 201) {
      return jsonDecode(r.body);
    }
    throw Exception('د Checkout جوړول ناکام: ${r.statusCode} - ${r.body}');
  }

  // ===== د Checkout سیشن حالت =====
  Future<Map<String, dynamic>> getSessionStatus(String sessionId) async {
    final r = await http.get(
      Uri.parse('${AppConstants.backendUrl}/api/payments/session/$sessionId'),
    );
    if (r.statusCode == 200) return jsonDecode(r.body);
    throw Exception('د سیشن پوښتنه ناکامه: ${r.body}');
  }

  // ===== د HesabPay (افغانستان) =====
  Future<Map<String, dynamic>> processHesabPay({
    required double amount,
    required String currency,
    required String phoneNumber,
    required String orderId,
    required String countryCode,
    required String operator,
    required int operatorId,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConstants.backendUrl}/api/payments/hesabpay'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'amount': amount,
        'currency': currency,
        'phoneNumber': phoneNumber,
        'orderId': orderId,
        'countryCode': countryCode,
        'operator': operator,
        'operatorId': operatorId,
      }),
    );

    if (r.statusCode == 200) return jsonDecode(r.body);
    throw Exception('HesabPay ناکام: ${r.statusCode} - ${r.body}');
  }

  // ===== د DT One لیږد (د بیک انډ له لارې) =====
  Future<Map<String, dynamic>> createTopup({
    required String countryCode,
    required String operator,
    required int operatorId,
    required String phoneNumber,
    required double amount,
    required String currency,
    required String orderId,
  }) async {
    final r = await http.post(
      Uri.parse('${AppConstants.backendUrl}/api/drone/topup'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'countryCode': countryCode,
        'operator': operator,
        'operatorId': operatorId,
        'phoneNumber': phoneNumber,
        'amount': amount,
        'currency': currency,
        'orderId': orderId,
      }),
    );

    if (r.statusCode == 200 || r.statusCode == 201) {
      return jsonDecode(r.body);
    }
    throw Exception('د DT One لیږد ناکام: ${r.statusCode} - ${r.body}');
  }

  // ===== د روغتیا ازموینه =====
  Future<bool> healthCheck() async {
    try {
      final r = await http
          .get(Uri.parse('${AppConstants.backendUrl}/health'))
          .timeout(const Duration(seconds: 5));
      return r.statusCode == 200;
    } catch (_) {
      return false;
    }
  }
}

// ========================================================
// ۶. د محلي ذخیرې سروس
// ========================================================
class StorageService {
  static const _txKey = 'transactions';
  static const _langKey = 'selected_language';

  Future<void> saveTransaction(AppTransaction tx) async {
    final prefs = await SharedPreferences.getInstance();
    final list = await getTransactions();
    list.insert(0, tx);
    await prefs.setStringList(
        _txKey, list.map((t) => jsonEncode(t.toJson())).toList());
  }

  Future<List<AppTransaction>> getTransactions() async {
    final prefs = await SharedPreferences.getInstance();
    final list = prefs.getStringList(_txKey) ?? [];
    return list.map((s) => AppTransaction.fromJson(jsonDecode(s))).toList();
  }

  Future<String?> getLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getString(_langKey);
  }

  Future<void> setLanguage(String code) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_langKey, code);
  }
}

// ========================================================
// ۷. د ټاپ-اپ مدیریت (Business Logic)
// ========================================================
class TopupManager {
  final BackendService _backend = BackendService();
  final StorageService _storage = StorageService();

  /// د تادیې پیل کول
  /// د افغانستان لپاره: HesabPay مستقیم
  /// د نورو لپاره: Stripe Checkout URL
  Future<String> initiateTopup({
    required String countryCode,
    required String operator,
    required int operatorId,
    required String phoneNumber,
    required double amount,
    required String currency,
    required String successUrl,
    required String cancelUrl,
  }) async {
    final fee = amount * AppConstants.feePercentage;
    final total = amount + fee;
    final orderId = 'PGNT${DateTime.now().millisecondsSinceEpoch}';

    if (countryCode == 'AF') {
      // ===== افغانستان: HesabPay =====
      final result = await _backend.processHesabPay(
        amount: total,
        currency: currency,
        phoneNumber: phoneNumber,
        orderId: orderId,
        countryCode: countryCode,
        operator: operator,
        operatorId: operatorId,
      );

      if (result['success'] == true) {
        // د ټرانزکشن ثبت
        await _recordTransaction(
          orderId: orderId,
          countryCode: countryCode,
          operator: operator,
          phoneNumber: phoneNumber,
          amount: amount,
          fee: fee,
          total: total,
          bonus: amount * AppConstants.bonusPercentage,
          paymentMethod: 'hesabpay',
          status: TransactionStatus.completed,
        );
        return 'SUCCESS';
      } else {
        throw Exception(result['message'] ?? 'HesabPay ناکام شو');
      }
    } else {
      // ===== نور هیوادونه: Stripe Checkout =====
      final result = await _backend.createStripeCheckout(
        amount: total,
        currency: currency,
        orderId: orderId,
        successUrl: successUrl,
        cancelUrl: cancelUrl,
        countryCode: countryCode,
        operator: operator,
        operatorId: operatorId,
        phoneNumber: phoneNumber,
      );

      final checkoutUrl = result['checkoutUrl'] as String?;
      if (checkoutUrl == null || checkoutUrl.isEmpty) {
        throw Exception('د Checkout URL ترلاسه نشو');
      }

      // د ټرانزکشن ثبت د pending حالت سره
      await _recordTransaction(
        orderId: orderId,
        countryCode: countryCode,
        operator: operator,
        phoneNumber: phoneNumber,
        amount: amount,
        fee: fee,
        total: total,
        bonus: amount * AppConstants.bonusPercentage,
        paymentMethod: 'stripe',
        status: TransactionStatus.pending,
      );

      return checkoutUrl;
    }
  }

  /// د بریالیتوب سکرین لپاره وروستی ټرانزکشن
  Future<AppTransaction?> getLatestTransaction() async {
    final list = await _storage.getTransactions();
    return list.isEmpty ? null : list.first;
  }

  /// د ټرانزکشن ثبت
  Future<void> _recordTransaction({
    required String orderId,
    required String countryCode,
    required String operator,
    required String phoneNumber,
    required double amount,
    required double fee,
    required double total,
    required double bonus,
    required String paymentMethod,
    required TransactionStatus status,
  }) async {
    final tx = AppTransaction(
      id: DateTime.now().microsecondsSinceEpoch.toString(),
      orderId: orderId,
      countryCode: countryCode,
      operator: operator,
      phoneNumber: phoneNumber,
      amount: amount,
      fee: fee,
      total: total,
      bonus: bonus,
      paymentMethod: paymentMethod,
      status: status,
      date: DateTime.now(),
    );
    await _storage.saveTransaction(tx);
  }

  /// د Stripe د بریالیتوب وروسته تازه کول
  Future<void> markLatestAsCompleted() async {
    final list = await _storage.getTransactions();
    if (list.isEmpty) return;
    final latest = list.first;
    final updated = AppTransaction(
      id: latest.id,
      orderId: latest.orderId,
      countryCode: latest.countryCode,
      operator: latest.operator,
      phoneNumber: latest.phoneNumber,
      amount: latest.amount,
      fee: latest.fee,
      total: latest.total,
      bonus: latest.bonus,
      paymentMethod: latest.paymentMethod,
      status: TransactionStatus.completed,
      date: latest.date,
    );
    // د لومړي بدلول
    list[0] = updated;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setStringList(
        'transactions', list.map((t) => jsonEncode(t.toJson())).toList());
  }
}

// ========================================================
// ۸. د اپلیکیشن پیل
// ========================================================
class PGNTApp extends StatefulWidget {
  const PGNTApp({super.key});
  @override
  State<PGNTApp> createState() => PGNTAppState();
}

class PGNTAppState extends State<PGNTApp> {
  Locale _locale = const Locale('en');
  bool _loaded = false;

  @override
  void initState() {
    super.initState();
    _loadLang();
  }

  Future<void> _loadLang() async {
    final code = await StorageService().getLanguage();
    if (code != null) setState(() => _locale = Locale(code));
    setState(() => _loaded = true);
  }

  void changeLanguage(Locale locale) async {
    setState(() => _locale = locale);
    await StorageService().setLanguage(locale.languageCode);
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) {
      return const MaterialApp(
        home: Scaffold(
          backgroundColor: Color(0xFF800000),
          body: Center(
            child: CircularProgressIndicator(color: Color(0xFFFFD700)),
          ),
        ),
      );
    }
    return MultiProvider(
      providers: [Provider<TopupManager>(create: (_) => TopupManager())],
      child: MaterialApp(
        title: 'PGNT Asian Topup',
        debugShowCheckedModeBanner: false,
        locale: _locale,
        localizationsDelegates: const [
          AppStrings.delegate,
          DefaultMaterialLocalizations.delegate,
          DefaultWidgetsLocalizations.delegate,
        ],
        supportedLocales: const [
          Locale('en'), Locale('ps'), Locale('fa'),
          Locale('ur'), Locale('hi'), Locale('bn'),
        ],
        theme: ThemeData(
          primaryColor: const Color(0xFF800000),
          scaffoldBackgroundColor: const Color(0xFF800000),
          colorScheme: ColorScheme.fromSeed(
            seedColor: const Color(0xFF800000),
            primary: const Color(0xFF800000),
            secondary: const Color(0xFFFFD700),
          ),
          useMaterial3: true,
        ),
        home: LanguageScreen(onLanguageSelected: changeLanguage),
      ),
    );
  }
}

// ========================================================
// ۹. د اصلي نیویګیشن
// ========================================================
class MainWrapper extends StatefulWidget {
  final int initialIndex;
  const MainWrapper({super.key, this.initialIndex = 0});
  @override
  State<MainWrapper> createState() => _MainWrapperState();
}

class _MainWrapperState extends State<MainWrapper> {
  late int _index;

  @override
  void initState() {
    super.initState();
    _index = widget.initialIndex;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);
    final screens = [
      const HomeScreen(),
      const HistoryScreen(),
      const WalletScreen(),
      const ProfileScreen(),
    ];

    return Scaffold(
      body: screens[_index],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _index,
        onTap: (i) => setState(() => _index = i),
        backgroundColor: const Color(0xFF600000),
        selectedItemColor: const Color(0xFFFFD700),
        unselectedItemColor: Colors.white54,
        type: BottomNavigationBarType.fixed,
        items: [
          BottomNavigationBarItem(icon: const Icon(Icons.home), label: l10n.get('home')),
          BottomNavigationBarItem(icon: const Icon(Icons.history), label: l10n.get('history')),
          BottomNavigationBarItem(icon: const Icon(Icons.wallet), label: l10n.get('wallet')),
          BottomNavigationBarItem(icon: const Icon(Icons.person), label: l10n.get('profile')),
        ],
      ),
    );
  }
}

// ========================================================
// ۱۰. د ژبې غوره کولو سکرین
// ========================================================
class LanguageScreen extends StatelessWidget {
  final Function(Locale) onLanguageSelected;
  const LanguageScreen({super.key, required this.onLanguageSelected});

  @override
  Widget build(BuildContext context) {
    final langs = [
      {'code': 'en', 'name': 'English', 'native': 'English', 'flag': '🇬🇧'},
      {'code': 'ps', 'name': 'Pashto', 'native': 'پښتو', 'flag': '🇦🇫'},
      {'code': 'fa', 'name': 'Dari', 'native': 'دری', 'flag': '🇦🇫'},
      {'code': 'ur', 'name': 'Urdu', 'native': 'اردو', 'flag': '🇵🇰'},
      {'code': 'hi', 'name': 'Hindi', 'native': 'हिन्दी', 'flag': '🇮🇳'},
      {'code': 'bn', 'name': 'Bengali', 'native': 'বাংলা', 'flag': '🇧🇩'},
    ];

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            children: [
              const SizedBox(height: 30),
              const Text('🌐', style: TextStyle(fontSize: 60)),
              const SizedBox(height: 20),
              const Text(
                'PGNT ASIAN TOPUP',
                style: TextStyle(
                  color: Color(0xFFFFD700),
                  fontSize: 22,
                  fontWeight: FontWeight.bold,
                  letterSpacing: 2,
                ),
              ),
              const SizedBox(height: 40),
              const Align(
                alignment: Alignment.centerLeft,
                child: Text('Select Language',
                    style: TextStyle(
                        color: Colors.white,
                        fontSize: 20,
                        fontWeight: FontWeight.bold)),
              ),
              const SizedBox(height: 20),
              Expanded(
                child: ListView.builder(
                  itemCount: langs.length,
                  itemBuilder: (context, i) {
                    final l = langs[i];
                    return Card(
                      color: Colors.white10,
                      margin: const EdgeInsets.only(bottom: 10),
                      child: ListTile(
                        leading: Text(l['flag']!,
                            style: const TextStyle(fontSize: 28)),
                        title: Text(l['name']!,
                            style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600)),
                        subtitle: Text(l['native']!,
                            style: const TextStyle(color: Colors.white70)),
                        trailing: const Icon(Icons.arrow_forward_ios,
                            color: Color(0xFFFFD700), size: 16),
                        onTap: () {
                          onLanguageSelected(Locale(l['code']!));
                          Navigator.pushReplacement(
                            context,
                            MaterialPageRoute(
                                builder: (_) => const MainWrapper()),
                          );
                        },
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ========================================================
// ۱۱. د کور پاڼې سکرین
// ========================================================
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _countryCode = 'AF';
  OperatorInfo? _operator;
  String _phone = '';
  double _amount = 100;

  CountryInfo get _country =>
      supportedCountries.firstWhere((c) => c.code == _countryCode);

  @override
  void initState() {
    super.initState();
    _operator = _country.operators.first;
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('appTitle'),
            style: const TextStyle(color: Colors.white, fontSize: 18)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications, color: Colors.white),
            onPressed: () {},
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFF800000), Color(0xFFA00000)]),
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: const Color(0xFFFFD700)),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l10n.get('walletBalance'),
                          style: const TextStyle(
                              color: Colors.white70, fontSize: 13)),
                      const SizedBox(height: 4),
                      const Text('€24.50',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 26,
                              fontWeight: FontWeight.bold)),
                      const Text('2% Bonus Active 🔥',
                          style: TextStyle(
                              color: Color(0xFFFFD700), fontSize: 11)),
                    ],
                  ),
                  ElevatedButton.icon(
                    onPressed: () {},
                    icon: const Icon(Icons.add, size: 18),
                    label: Text(l10n.get('addMoney'),
                        style: const TextStyle(fontSize: 12)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFFFD700),
                      foregroundColor: const Color(0xFF800000),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            _title(l10n.get('selectCountry')),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: supportedCountries.map((c) {
                final sel = _countryCode == c.code;
                return GestureDetector(
                  onTap: () => setState(() {
                    _countryCode = c.code;
                    _operator = c.operators.first;
                  }),
                  child: Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: sel ? Colors.white24 : Colors.transparent,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                        color: sel
                            ? const Color(0xFFFFD700)
                            : Colors.white30,
                        width: 2,
                      ),
                    ),
                    child: Column(
                      children: [
                        Text(c.flag, style: const TextStyle(fontSize: 28)),
                        const SizedBox(height: 4),
                        Text(c.nameEn,
                            style: TextStyle(
                                color: sel ? Colors.white : Colors.white70,
                                fontSize: 10)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            _title(l10n.get('selectOperator')),
            const SizedBox(height: 10),
            Wrap(
              spacing: 10,
              runSpacing: 10,
              children: _country.operators.map((op) {
                final sel = _operator?.name == op.name;
                return ChoiceChip(
                  label: Text(op.name),
                  selected: sel,
                  onSelected: (_) => setState(() => _operator = op),
                  selectedColor: const Color(0xFFFFD700),
                  labelStyle: TextStyle(
                      color: sel ? const Color(0xFF800000) : Colors.white),
                  backgroundColor: Colors.white10,
                );
              }).toList(),
            ),
            const SizedBox(height: 24),
            _title(l10n.get('phoneNumber')),
            const SizedBox(height: 10),
            TextField(
              style: const TextStyle(color: Colors.white),
              keyboardType: TextInputType.phone,
              onChanged: (v) => _phone = v,
              decoration: InputDecoration(
                hintText:
                    '+${AppConstants.countryDialCodes[_countryCode]} 7XX XXX XXX',
                hintStyle: const TextStyle(color: Colors.white38),
                prefixIcon:
                    const Icon(Icons.phone, color: Colors.white54),
                filled: true,
                fillColor: Colors.white10,
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Colors.white30),
                ),
                focusedBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: const BorderSide(color: Color(0xFFFFD700)),
                ),
              ),
            ),
            const SizedBox(height: 24),
            _title(l10n.get('selectAmount')),
            const SizedBox(height: 10),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceEvenly,
              children: [100, 250, 500, 1000].map((amt) {
                final sel = _amount == amt.toDouble();
                return ChoiceChip(
                  label: Text('$amt AFN', style: const TextStyle(fontSize: 11)),
                  selected: sel,
                  onSelected: (_) => setState(() => _amount = amt.toDouble()),
                  selectedColor: const Color(0xFFFFD700),
                  labelStyle: TextStyle(
                      color: sel ? const Color(0xFF800000) : Colors.white),
                  backgroundColor: Colors.white10,
                );
              }).toList(),
            ),
            const SizedBox(height: 30),
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                onPressed: _goToConfirm,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFD700),
                  foregroundColor: const Color(0xFF800000),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30)),
                ),
                child: Text(l10n.get('continue'),
                    style: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _title(String t) => Text(t,
      style: const TextStyle(
          color: Colors.white, fontSize: 15, fontWeight: FontWeight.bold));

  void _goToConfirm() {
    final l10n = AppStrings.of(context);
    if (_phone.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(l10n.get('phoneNumber'))),
      );
      return;
    }
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => ConfirmTopupScreen(
          countryCode: _countryCode,
          operator: _operator!.name,
          operatorId: _operator!.dtOneOperatorId,
          phoneNumber: _phone,
          amount: _amount,
        ),
      ),
    );
  }
}

// ========================================================
// ۱۲. د تایید سکرین
// ========================================================
class ConfirmTopupScreen extends StatefulWidget {
  final String countryCode;
  final String operator;
  final int operatorId;
  final String phoneNumber;
  final double amount;

  const ConfirmTopupScreen({
    super.key,
    required this.countryCode,
    required this.operator,
    required this.operatorId,
    required this.phoneNumber,
    required this.amount,
  });

  @override
  State<ConfirmTopupScreen> createState() => _ConfirmTopupScreenState();
}

class _ConfirmTopupScreenState extends State<ConfirmTopupScreen> {
  bool _loading = false;

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);
    final fee = widget.amount * AppConstants.feePercentage;
    final bonus = widget.amount * AppConstants.bonusPercentage;
    final total = widget.amount + fee;
    final isAf = widget.countryCode == 'AF';

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('confirmTopup'),
            style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Card(
              color: Colors.white10,
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(
                  children: [
                    _row(l10n.get('selectOperator'), widget.operator),
                    _div(),
                    _row(l10n.get('phoneNumber'), widget.phoneNumber),
                    _div(),
                    _row(l10n.get('amount'),
                        '${widget.amount.toInt()} AFN'),
                    _div(),
                    _row(l10n.get('bonus'), '+${bonus.toInt()} AFN',
                        gold: true),
                    _div(),
                    _row(l10n.get('fee'), '€${fee.toStringAsFixed(2)}'),
                    _div(),
                    _row(l10n.get('total'),
                        '€${total.toStringAsFixed(2)}',
                        bold: true, gold: true),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 24),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(l10n.get('paymentMethod'),
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 16,
                      fontWeight: FontWeight.bold)),
            ),
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.white10,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFFD700)),
              ),
              child: Row(
                children: [
                  Icon(
                    isAf ? Icons.account_balance_wallet : Icons.credit_card,
                    color: const Color(0xFFFFD700),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          isAf
                              ? l10n.get('payWithHesabPay')
                              : l10n.get('payWithStripe'),
                          style: const TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.bold),
                        ),
                        Text(
                          isAf
                              ? 'HesabPay - Afghanistan'
                              : 'Stripe Checkout - Secure',
                          style: const TextStyle(
                              color: Colors.white54, fontSize: 12),
                        ),
                      ],
                    ),
                  ),
                  const Icon(Icons.check_circle,
                      color: Color(0xFFFFD700)),
                ],
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 55,
              child: ElevatedButton(
                onPressed: _loading ? null : _pay,
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFFFFD700),
                  foregroundColor: const Color(0xFF800000),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(30)),
                ),
                child: _loading
                    ? const SizedBox(
                        height: 22,
                        width: 22,
                        child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Color(0xFF800000)))
                    : Text(
                        '${l10n.get('payNow')} €${total.toStringAsFixed(2)}',
                        style: const TextStyle(
                            fontSize: 16, fontWeight: FontWeight.bold)),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
      ),
    );
  }

  Widget _row(String l, String v, {bool gold = false, bool bold = false}) =>
      Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(l,
                style:
                    const TextStyle(color: Colors.white70, fontSize: 14)),
            Text(v,
                style: TextStyle(
                  color: gold ? const Color(0xFFFFD700) : Colors.white,
                  fontWeight: bold ? FontWeight.bold : FontWeight.normal,
                  fontSize: bold ? 17 : 14,
                )),
          ],
        ),
      );

  Widget _div() => const Divider(color: Colors.white12, height: 1);

  Future<void> _pay() async {
    final l10n = AppStrings.of(context);
    setState(() => _loading = true);

    try {
      final result = await context.read<TopupManager>().initiateTopup(
            countryCode: widget.countryCode,
            operator: widget.operator,
            operatorId: widget.operatorId,
            phoneNumber: widget.phoneNumber,
            amount: widget.amount,
            currency: widget.countryCode == 'AF' ? 'AFN' : 'EUR',
            successUrl: 'https://your-app.com/success',
            cancelUrl: 'https://your-app.com/cancel',
          );

      if (!mounted) return;

      if (result == 'SUCCESS') {
        // HesabPay: سمدلاسه بریالیتوب
        setState(() => _loading = false);
        final tx = await context.read<TopupManager>().getLatestTransaction();
        if (!mounted || tx == null) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => SuccessScreen(transaction: tx)),
        );
      } else {
        // Stripe: د تادیې پاڼه پرانیزو
        setState(() => _loading = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(l10n.get('openingPayment'))),
        );

        final uri = Uri.parse(result);
        if (await canLaunchUrl(uri)) {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        } else {
          throw Exception('د تادیې پاڼه نه شي پرانیستل کیدای');
        }

        // ⚠️ د ازموینې لپاره، موږ د بریالیتوب سکرین ته ځو.
        // په ریښتیني اپ کې باید د Webhook تایید ته انتظار وکړو.
        if (!mounted) return;
        await context.read<TopupManager>().markLatestAsCompleted();
        final tx = await context.read<TopupManager>().getLatestTransaction();
        if (!mounted || tx == null) return;
        Navigator.pushReplacement(
          context,
          MaterialPageRoute(builder: (_) => SuccessScreen(transaction: tx)),
        );
      }
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('${l10n.get('error')}: $e'),
          backgroundColor: Colors.red.shade800,
        ),
      );
    }
  }
}

// ========================================================
// ۱۳. د بریالیتوب سکرین
// ========================================================
class SuccessScreen extends StatelessWidget {
  final AppTransaction transaction;
  const SuccessScreen({super.key, required this.transaction});

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);
    final df = DateFormat('dd MMM yyyy, HH:mm');

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              const Icon(Icons.check_circle,
                  color: Colors.green, size: 100),
              const SizedBox(height: 20),
              Text(l10n.get('topupSuccessful'),
                  style: const TextStyle(
                      color: Colors.white,
                      fontSize: 24,
                      fontWeight: FontWeight.bold)),
              const SizedBox(height: 10),
              Text(l10n.get('successMessage'),
                  style: const TextStyle(color: Colors.white70)),
              const SizedBox(height: 30),
              Card(
                color: Colors.white10,
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    children: [
                      _row(l10n.get('orderId'), transaction.orderId),
                      _row(l10n.get('selectOperator'), transaction.operator),
                      _row(l10n.get('phoneNumber'), transaction.phoneNumber),
                      _row(l10n.get('amount'),
                          '${transaction.amount.toInt()} AFN'),
                      _row(l10n.get('total'),
                          '€${transaction.total.toStringAsFixed(2)}'),
                      _row(l10n.get('date'), df.format(transaction.date)),
                      _row(l10n.get('status'), l10n.get('completed'),
                          green: true),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 50,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(
                          builder: (_) => const MainWrapper()),
                      (r) => false,
                    );
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFFFD700),
                    foregroundColor: const Color(0xFF800000),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(30)),
                  ),
                  child: Text(l10n.get('newTopup'),
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _row(String l, String v, {bool green = false}) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(l,
                style:
                    const TextStyle(color: Colors.white70, fontSize: 13)),
            Flexible(
              child: Text(v,
                  textAlign: TextAlign.right,
                  style: TextStyle(
                      color: green ? Colors.green : Colors.white,
                      fontWeight: FontWeight.bold,
                      fontSize: 13)),
            ),
          ],
        ),
      );
}

// ========================================================
// ۱۴. د تاریخچې سکرین
// ========================================================
class HistoryScreen extends StatefulWidget {
  const HistoryScreen({super.key});
  @override
  State<HistoryScreen> createState() => _HistoryScreenState();
}

class _HistoryScreenState extends State<HistoryScreen> {
  List<AppTransaction> _txs = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final list = await StorageService().getTransactions();
    if (mounted) {
      setState(() {
        _txs = list;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('history'),
            style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: _loading
          ? const Center(
              child:
                  CircularProgressIndicator(color: Color(0xFFFFD700)))
          : _txs.isEmpty
              ? Center(
                  child: Text(l10n.get('noTransactions'),
                      style: const TextStyle(color: Colors.white70)),
                )
              : RefreshIndicator(
                  onRefresh: _load,
                  child: ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: _txs.length,
                    itemBuilder: (context, i) =>
                        _buildItem(_txs[i], l10n),
                  ),
                ),
    );
  }

  Widget _buildItem(AppTransaction tx, AppStrings l10n) {
    Color c;
    String sLabel;
    switch (tx.status) {
      case TransactionStatus.completed:
        c = Colors.green;
        sLabel = l10n.get('completed');
        break;
      case TransactionStatus.pending:
      case TransactionStatus.created:
        c = Colors.orange;
        sLabel = l10n.get('pending');
        break;
      case TransactionStatus.failed:
        c = Colors.red;
        sLabel = l10n.get('failed');
        break;
    }

    return Card(
      color: Colors.white10,
      margin: const EdgeInsets.only(bottom: 10),
      child: ListTile(
        leading: CircleAvatar(
          backgroundColor: const Color(0xFFFFD700),
          child: Text(
            tx.operator.isNotEmpty ? tx.operator[0] : '?',
            style: const TextStyle(
                color: Color(0xFF800000),
                fontWeight: FontWeight.bold),
          ),
        ),
        title: Text('${tx.amount.toInt()} AFN',
            style: const TextStyle(
                color: Colors.white, fontWeight: FontWeight.bold)),
        subtitle: Text(
          '${tx.operator} • ${DateFormat('dd MMM, HH:mm').format(tx.date)}',
          style: const TextStyle(color: Colors.white54, fontSize: 12),
        ),
        trailing: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(sLabel,
                style: TextStyle(
                    color: c,
                    fontWeight: FontWeight.bold,
                    fontSize: 12)),
            const SizedBox(height: 4),
            Text('€${tx.total.toStringAsFixed(2)}',
                style: const TextStyle(
                    color: Colors.white70, fontSize: 11)),
          ],
        ),
      ),
    );
  }
}

// ========================================================
// ۱۵. د والټ سکرین
// ========================================================
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('wallet'),
            style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFF800000), Color(0xFFA00000)]),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: const Color(0xFFFFD700)),
              ),
              child: Column(
                children: [
                  Text(l10n.get('walletBalance'),
                      style: const TextStyle(
                          color: Colors.white70, fontSize: 15)),
                  const SizedBox(height: 8),
                  const Text('€24.50',
                      style: TextStyle(
                          color: Colors.white,
                          fontSize: 38,
                          fontWeight: FontWeight.bold)),
                  const SizedBox(height: 8),
                  const Text('2% Bonus Active 🔥',
                      style: TextStyle(color: Color(0xFFFFD700))),
                  const SizedBox(height: 20),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.add),
                        label: Text(l10n.get('addMoney')),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: const Color(0xFFFFD700),
                          foregroundColor: const Color(0xFF800000),
                        ),
                      ),
                      ElevatedButton.icon(
                        onPressed: () {},
                        icon: const Icon(Icons.remove),
                        label: const Text('Withdraw'),
                        style: ElevatedButton.styleFrom(
                          backgroundColor: Colors.white24,
                          foregroundColor: Colors.white,
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ========================================================
// ۱۶. د پروفایل سکرین
// ========================================================
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = AppStrings.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.get('profile'),
            style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        foregroundColor: Colors.white,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const CircleAvatar(
            radius: 40,
            backgroundColor: Color(0xFFFFD700),
            child: Icon(Icons.person,
                size: 50, color: Color(0xFF800000)),
          ),
          const SizedBox(height: 12),
          const Center(
            child: Text('PGNT User',
                style: TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.bold)),
          ),
          const Center(
            child: Text('user@example.com',
                style: TextStyle(color: Colors.white54)),
          ),
          const SizedBox(height: 24),
          _item(Icons.person_outline, l10n.get('myProfile'), () {}),
          _item(Icons.share_outlined, l10n.get('referralLink'), () {}),
          _item(Icons.language, l10n.get('language'), () {
            final state = context.findAncestorStateOfType<PGNTAppState>();
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => LanguageScreen(
                  onLanguageSelected: (locale) {
                    if (state != null) state.changeLanguage(locale);
                    Navigator.pop(context);
                  },
                ),
              ),
            );
          }),
          _item(Icons.help_outline, l10n.get('support'), () {}),
          _item(Icons.info_outline, l10n.get('faq'), () {}),
          _item(Icons.description_outlined, l10n.get('terms'), () {}),
          _item(Icons.privacy_tip_outlined, l10n.get('privacy'), () {}),
          _item(Icons.logout, l10n.get('logout'), () {}, red: true),
        ],
      ),
    );
  }

  Widget _item(IconData icon, String title, VoidCallback onTap,
      {bool red = false}) {
    return Card(
      color: Colors.white10,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListTile(
        leading: Icon(icon, color: red ? Colors.red : Colors.white),
        title: Text(title,
            style: TextStyle(color: red ? Colors.red : Colors.white)),
        trailing: const Icon(Icons.arrow_forward_ios,
            size: 14, color: Colors.white54),
        onTap: onTap,
      ),
    );
  }
}
