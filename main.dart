
import 'dart:async';
import 'dart:convert';

import 'package:app_links/app_links.dart';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
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

// Brand-inspired compact marks keep operator cards recognizable without
// relying on emoji artwork. Official image assets can replace these later.
class OperatorBrandMark extends StatelessWidget {
  final MobileOperator operator;
  final double size;

  const OperatorBrandMark({
    super.key,
    required this.operator,
    this.size = 42,
  });

  @override
  Widget build(BuildContext context) {
    final key = operator.name.toLowerCase();
    final Color brandColor;
    final String mark;
    switch (key) {
      case 'roshan':
        brandColor = const Color(0xFFE36B24);
        mark = 'R';
        break;
      case 'etisalat':
        brandColor = const Color(0xFF65A832);
        mark = 'e';
        break;
      case 'atoma':
        brandColor = const Color(0xFF512B82);
        mark = 'A';
        break;
      case 'awcc':
        brandColor = const Color(0xFF1769AA);
        mark = 'AW';
        break;
      case 'salaam':
        brandColor = const Color(0xFF168447);
        mark = 'S';
        break;
      case 'jazz':
        brandColor = const Color(0xFFED1C24);
        mark = 'J';
        break;
      case 'zong':
        brandColor = const Color(0xFF008C45);
        mark = 'Z';
        break;
      case 'ufone':
        brandColor = const Color(0xFF7A1FA2);
        mark = 'U';
        break;
      case 'telenor':
        brandColor = const Color(0xFF00A5DF);
        mark = 'T';
        break;
      case 'airtel':
        brandColor = const Color(0xFFE40000);
        mark = 'air';
        break;
      case 'jio':
        brandColor = const Color(0xFF0866C6);
        mark = 'Jio';
        break;
      case 'vi':
        brandColor = const Color(0xFF6B238E);
        mark = 'Vi';
        break;
      case 'grameenphone':
        brandColor = const Color(0xFF0078BF);
        mark = 'GP';
        break;
      case 'robi':
        brandColor = const Color(0xFFE32636);
        mark = 'robi';
        break;
      case 'banglalink':
        brandColor = const Color(0xFFF58220);
        mark = 'bl';
        break;
      default:
        brandColor = primaryRed;
        mark = operator.name.isEmpty ? '?' : operator.name[0].toUpperCase();
    }

    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: brandColor,
        shape: BoxShape.circle,
        border: Border.all(color: brandColor.withOpacity(0.18), width: 2),
        boxShadow: [
          BoxShadow(
            color: brandColor.withOpacity(0.16),
            blurRadius: 7,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: FittedBox(
        fit: BoxFit.scaleDown,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4),
          child: Text(
            mark,
            style: TextStyle(
              color: Colors.white,
              fontSize: size * 0.36,
              fontWeight: FontWeight.w900,
              letterSpacing: -0.4,
            ),
          ),
        ),
      ),
    );
  }
}

Color operatorBrandColor(String name) {
  switch (name) {
    case 'Roshan':
    case 'Jazz':
    case 'Airtel':
    case 'Robi':
      return const Color(0xFFE31E24);
    case 'Etisalat':
    case 'Zong':
    case 'Grameenphone':
      return const Color(0xFF008A4B);
    case 'ATOMA':
    case 'Jio':
      return const Color(0xFF1769AA);
    case 'AWCC':
    case 'Ufone':
    case 'Banglalink':
      return const Color(0xFFE87524);
    case 'Salaam':
    case 'Vi':
      return const Color(0xFF6A287D);
    case 'Telenor':
      return const Color(0xFF0067A5);
    default:
      return primaryRed;
  }
}

String operatorInitials(String name) {
  switch (name) {
    case 'Grameenphone':
      return 'GP';
    case 'Banglalink':
      return 'BL';
    case 'Etisalat':
      return 'e';
    default:
      final parts = name.trim().split(RegExp(r'\s+'));
      if (parts.length > 1) {
        return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
      }
      return name.length <= 2
          ? name.toUpperCase()
          : name.substring(0, 2).toUpperCase();
  }
}

const List<MobileOperator> operators = [
  // Afghanistan
  MobileOperator('AF', 'Roshan', '📶'),
  MobileOperator('AF', 'Etisalat', '📱'),
  MobileOperator('AF', 'ATOMA', '📡'),
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
  'AFN': [100, 115, 250, 500, 1000],
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
  refundPending,
  refunded,
  refundNeedsReview,
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
    case TransactionStatus.refundPending:
      return tr(languageCode, 'refundPending');
    case TransactionStatus.refunded:
      return tr(languageCode, 'refunded');
    case TransactionStatus.refundNeedsReview:
      return tr(languageCode, 'refundNeedsReview');
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
  final String? orderId;

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
    this.orderId,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'phone': phone,
        'countryCode': countryCode,
        'operatorName': operatorName,
        'amount': amount,
        'currency': currency,
        'fee': fee,
        'bonus': bonus,
        'status': status.name,
        'createdAt': createdAt.toIso8601String(),
        'orderId': orderId,
      };

  factory TopUpTransaction.fromJson(Map<String, dynamic> json) {
    final rawStatus = json['status']?.toString();
    final status = TransactionStatus.values.firstWhere(
      (value) => value.name == rawStatus,
      orElse: () => TransactionStatus.pending,
    );
    return TopUpTransaction(
      id: json['id']?.toString() ?? json['orderId']?.toString() ?? '',
      phone: json['phone']?.toString() ?? '',
      countryCode: json['countryCode']?.toString() ?? '',
      operatorName: json['operatorName']?.toString() ?? '',
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      currency: json['currency']?.toString() ?? '',
      fee: (json['fee'] as num?)?.toDouble() ?? 0,
      bonus: (json['bonus'] as num?)?.toDouble() ?? 0,
      status: status,
      createdAt: DateTime.tryParse(json['createdAt']?.toString() ?? '') ??
          DateTime.now(),
      orderId: json['orderId']?.toString(),
    );
  }
}

// Safe phone formatting helper
String normalizePhone(String value) {
  return value.replaceAll(
    RegExp(r'[\s\-()]'),
    '',
  );
}

// Detect an Afghan operator from the assigned mobile prefix.
// This is a best-effort suggestion: number portability can make prefixes
// differ from the current serving network, so the user can still change it.
String? detectAfghanOperator(String value) {
  var digits = value.replaceAll(RegExp(r'\D'), '');
  if (digits.startsWith('0093')) {
    digits = digits.substring(4);
  } else if (digits.startsWith('93') && digits.length >= 11) {
    digits = digits.substring(2);
  }
  if (digits.startsWith('0')) {
    digits = digits.substring(1);
  }
  if (digits.length < 2) return null;

  final prefix = digits.substring(0, 2);
  switch (prefix) {
    case '72':
    case '79':
      return 'Roshan';
    case '70':
    case '71':
      return 'AWCC';
    case '73':
    case '78':
      return 'Etisalat';
    case '76':
    case '77':
      return 'ATOMA';
    case '74':
    case '75':
      return 'Salaam';
    default:
      return null;
  }
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
    'faqCheckQ': "څنګه د خپل ټاپ‌اپ حالت وګورم؟",
    'faqCheckA': "د معاملاتو تاریخ خلاص کړئ او د امر حالت وګورئ. د مرستې غوښتلو پر مهال د معاملې شمېره وساتئ.",
    'faqDelayQ': "که ټاپ‌اپ وځنډېږي، څه وکړم؟",
    'faqDelayA': "سمدستي بیا پیسې مه ورکوئ. لومړی د امر حالت وګورئ؛ د شبکې تایید کله ناکله وخت نیسي.",
    'faqFailQ': "که ټاپ‌اپ ناکام شي، څه کېږي؟",
    'faqFailA': "د معاملې شمېره او د تادیې رسید وساتئ. د بېرته ورکړې یا بیاکتنې پرېکړه باید د تادیې او امر له ثبتونو تایید شي.",
    'faqPaymentQ': "ایا د تادیې تایید د ټاپ‌اپ بشپړېدل دي؟",
    'faqPaymentA': "نه. د تادیې بریالیتوب په خپله دا نه ثابتوي چې د موبایل شبکې ټاپ‌اپ بشپړ کړی دی.",
    'faqPrivacyQ': "کوم معلومات باید هېڅکله شریک نه کړم؟",
    'faqPrivacyA': "خپل پټنوم، د کارت بشپړ معلومات، PIN، یوځلي امنیتي کوډ یا د تادیې د خدمت پټې کیلي هېڅکله مه شریکوئ.",
    'customAmount': "خپل مقدار ولیکئ",
    'invalidAmount': "مهرباني وکړئ یو سم مثبت مقدار ولیکئ.",
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
    'refundPending': 'د بېرته ورکړې په تمه',
    'refunded': 'پیسې بېرته ورکړل شوې',
    'refundNeedsReview': 'د بېرته ورکړې ارزونه اړینه ده',
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
    'changeCountry': 'د هېواد بدلول',
    'referralCode': 'د بلنې کوډ (اختیاري)',
    'referralHint': 'اختیاري — انعام د چارج له بریالیتوب وروسته ثبتېږي.',
    'invalidReferralCode': 'د بلنې کوډ باید ۴ تر ۴۰ توري، شمېرې، _ یا - ولري.',
  },

  'fa': {
    'faqCheckQ': "چگونه وضعیت شارژ خود را بررسی کنم؟",
    'faqCheckA': "تاریخچه تراکنش‌ها را باز کنید و وضعیت سفارش را ببینید. هنگام درخواست کمک، شماره تراکنش را نگه دارید.",
    'faqDelayQ': "اگر شارژ به تأخیر افتاد چه کنم؟",
    'faqDelayA': "فوراً دوباره پرداخت نکنید. ابتدا وضعیت سفارش را بررسی کنید؛ تأیید اپراتور گاهی زمان می‌برد.",
    'faqFailQ': "اگر شارژ ناموفق شود چه اتفاقی می‌افتد؟",
    'faqFailA': "شماره تراکنش و رسید پرداخت را نگه دارید. بازپرداخت یا بررسی باید با سوابق پرداخت و سفارش تأیید شود.",
    'faqPaymentQ': "آیا تأیید پرداخت به معنی تکمیل شارژ است؟",
    'faqPaymentA': "خیر. موفقیت پرداخت به‌تنهایی ثابت نمی‌کند که اپراتور شارژ را تکمیل کرده است.",
    'faqPrivacyQ': "چه اطلاعاتی را هرگز نباید به اشتراک بگذارم؟",
    'faqPrivacyA': "رمز عبور، اطلاعات کامل کارت، PIN، کد امنیتی یک‌بارمصرف یا کلیدهای محرمانه پرداخت را هرگز به اشتراک نگذارید.",
    'customAmount': "مقدار دلخواه را وارد کنید",
    'invalidAmount': "لطفاً یک مقدار مثبت و معتبر وارد کنید.",
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
    'refundPending': 'در انتظار بازپرداخت',
    'refunded': 'بازپرداخت شد',
    'refundNeedsReview': 'نیاز به بررسی بازپرداخت',
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
    'changeCountry': 'تغییر کشور',
    'referralCode': 'کد دعوت (اختیاری)',
    'referralHint': 'اختیاری — پاداش پس از شارژ موفق ثبت می‌شود.',
    'invalidReferralCode': 'کد دعوت باید ۴ تا ۴۰ حرف، عدد، _ یا - داشته باشد.',
  },

  'en': {
    'faqCheckQ': "How can I check my top-up?",
    'faqCheckA': "Open History and review the order status. Keep your transaction ID when asking for help.",
    'faqDelayQ': "What should I do if a top-up is delayed?",
    'faqDelayA': "Do not pay again immediately. Check the order status first; some operator confirmations take additional time.",
    'faqFailQ': "What happens if a top-up fails?",
    'faqFailA': "Keep the transaction ID and payment receipt. A refund or review must be confirmed by the payment and order records.",
    'faqPaymentQ': "Is payment confirmation the same as top-up completion?",
    'faqPaymentA': "No. A successful payment does not by itself mean the mobile operator has completed the top-up.",
    'faqPrivacyQ': "What information should I never share?",
    'faqPrivacyA': "Never share your password, full card details, card PIN, one-time security code, or payment-provider secret keys.",
    'customAmount': "Enter your own amount",
    'invalidAmount': "Enter a valid positive amount.",
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
    'refundPending': 'Refund pending',
    'refunded': 'Refunded',
    'refundNeedsReview': 'Refund needs review',
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
    'changeCountry': 'Change country',
    'referralCode': 'Referral code (optional)',
    'referralHint': 'Optional — the reward is credited after a successful top-up.',
    'invalidReferralCode': 'Referral code must be 4–40 letters, numbers, _ or -.',
  },

  'ur': {
    'faqCheckQ': "میں اپنے ٹاپ اپ کی حالت کیسے دیکھ سکتا ہوں؟",
    'faqCheckA': "ہسٹری کھولیں اور آرڈر کی حالت دیکھیں۔ مدد مانگتے وقت ٹرانزیکشن نمبر محفوظ رکھیں۔",
    'faqDelayQ': "اگر ٹاپ اپ میں دیر ہو تو کیا کروں؟",
    'faqDelayA': "فوراً دوبارہ ادائیگی نہ کریں۔ پہلے آرڈر کی حالت دیکھیں؛ نیٹ ورک کی تصدیق میں وقت لگ سکتا ہے۔",
    'faqFailQ': "اگر ٹاپ اپ ناکام ہو جائے تو کیا ہوگا؟",
    'faqFailA': "ٹرانزیکشن نمبر اور ادائیگی کی رسید محفوظ رکھیں۔ رقم واپسی یا جائزے کی تصدیق ادائیگی اور آرڈر کے ریکارڈ سے ہونی چاہیے۔",
    'faqPaymentQ': "کیا ادائیگی کی تصدیق کا مطلب ٹاپ اپ مکمل ہونا ہے؟",
    'faqPaymentA': "نہیں۔ ادائیگی کامیاب ہونے سے یہ ثابت نہیں ہوتا کہ موبائل نیٹ ورک نے ٹاپ اپ مکمل کر دیا ہے۔",
    'faqPrivacyQ': "کون سی معلومات کبھی شیئر نہیں کرنی چاہئیں؟",
    'faqPrivacyA': "اپنا پاس ورڈ، کارڈ کی مکمل تفصیلات، PIN، ایک بار استعمال ہونے والا سیکیورٹی کوڈ یا ادائیگی کی خفیہ کلیدیں کبھی شیئر نہ کریں۔",
    'customAmount': "اپنی رقم درج کریں",
    'invalidAmount': "درست مثبت رقم درج کریں۔",
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
    'refundPending': 'رقم واپسی زیرِ انتظار',
    'refunded': 'رقم واپس کر دی گئی',
    'refundNeedsReview': 'رقم واپسی کا جائزہ درکار ہے',
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
    'changeCountry': 'ملک تبدیل کریں',
    'referralCode': 'دعوتی کوڈ (اختیاری)',
    'referralHint': 'اختیاری — کامیاب ریچارج کے بعد انعام درج ہوگا۔',
    'invalidReferralCode': 'دعوتی کوڈ میں ۴ سے ۴۰ حروف، اعداد، _ یا - ہوں۔',
  },

  'hi': {
    'faqCheckQ': "मैं अपना टॉप-अप कैसे जाँचूँ?",
    'faqCheckA': "इतिहास खोलें और ऑर्डर की स्थिति देखें। सहायता माँगते समय लेन-देन आईडी अपने पास रखें।",
    'faqDelayQ': "टॉप-अप में देरी हो तो क्या करूँ?",
    'faqDelayA': "तुरंत दोबारा भुगतान न करें। पहले ऑर्डर की स्थिति देखें; नेटवर्क की पुष्टि में समय लग सकता है।",
    'faqFailQ': "टॉप-अप विफल होने पर क्या होगा?",
    'faqFailA': "लेन-देन आईडी और भुगतान रसीद सुरक्षित रखें। रिफंड या समीक्षा की पुष्टि भुगतान और ऑर्डर रिकॉर्ड से होनी चाहिए।",
    'faqPaymentQ': "क्या भुगतान की पुष्टि का अर्थ टॉप-अप पूरा होना है?",
    'faqPaymentA': "नहीं। भुगतान सफल होने से यह साबित नहीं होता कि मोबाइल ऑपरेटर ने टॉप-अप पूरा कर दिया है।",
    'faqPrivacyQ': "कौन-सी जानकारी कभी साझा नहीं करनी चाहिए?",
    'faqPrivacyA': "अपना पासवर्ड, कार्ड का पूरा विवरण, PIN, एक बार इस्तेमाल होने वाला सुरक्षा कोड या भुगतान सेवा की गुप्त कुंजियाँ साझा न करें।",
    'customAmount': "अपनी राशि दर्ज करें",
    'invalidAmount': "मान्य सकारात्मक राशि दर्ज करें।",
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
    'refundPending': 'रिफंड लंबित',
    'refunded': 'रिफंड हो गया',
    'refundNeedsReview': 'रिफंड की समीक्षा आवश्यक',
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
    'changeCountry': 'देश बदलें',
    'referralCode': 'रेफरल कोड (वैकल्पिक)',
    'referralHint': 'वैकल्पिक — सफल रिचार्ज के बाद इनाम दर्ज होगा।',
    'invalidReferralCode': 'रेफरल कोड में 4–40 अक्षर, अंक, _ या - होने चाहिए।',
  },

  'bn': {
    'faqCheckQ': "আমি কীভাবে আমার টপ-আপের অবস্থা দেখব?",
    'faqCheckA': "ইতিহাস খুলে অর্ডারের অবস্থা দেখুন। সাহায্য চাইলে লেনদেনের আইডি সংরক্ষণ করুন।",
    'faqDelayQ': "টপ-আপ দেরি হলে কী করব?",
    'faqDelayA': "সঙ্গে সঙ্গে আবার পেমেন্ট করবেন না। আগে অর্ডারের অবস্থা দেখুন; নেটওয়ার্কের নিশ্চিতকরণে সময় লাগতে পারে।",
    'faqFailQ': "টপ-আপ ব্যর্থ হলে কী হবে?",
    'faqFailA': "লেনদেনের আইডি ও পেমেন্টের রসিদ রাখুন। ফেরত বা পর্যালোচনা পেমেন্ট ও অর্ডারের রেকর্ড দিয়ে নিশ্চিত করতে হবে।",
    'faqPaymentQ': "পেমেন্ট নিশ্চিত হওয়া কি টপ-আপ সম্পন্ন হওয়ার সমান?",
    'faqPaymentA': "না। পেমেন্ট সফল হলেই মোবাইল অপারেটর টপ-আপ সম্পন্ন করেছে—এটি প্রমাণ হয় না।",
    'faqPrivacyQ': "কোন তথ্য কখনো শেয়ার করা উচিত নয়?",
    'faqPrivacyA': "পাসওয়ার্ড, কার্ডের সম্পূর্ণ তথ্য, PIN, একবার ব্যবহারযোগ্য নিরাপত্তা কোড বা পেমেন্ট প্রদানকারীর গোপন কী শেয়ার করবেন না。",
    'customAmount': "নিজের পরিমাণ লিখুন",
    'invalidAmount': "একটি বৈধ ধনাত্মক পরিমাণ লিখুন।",
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
    'refundPending': 'রিফান্ড অপেক্ষমাণ',
    'refunded': 'রিফান্ড সম্পন্ন',
    'refundNeedsReview': 'রিফান্ড পর্যালোচনা প্রয়োজন',
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
    'changeCountry': 'দেশ পরিবর্তন করুন',
    'referralCode': 'রেফারেল কোড (ঐচ্ছিক)',
    'referralHint': 'ঐচ্ছিক — সফল রিচার্জের পর পুরস্কার জমা হবে।',
    'invalidReferralCode': 'রেফারেল কোডে ৪–৪০টি অক্ষর, সংখ্যা, _ বা - থাকতে হবে।'
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
      padding: const EdgeInsets.all(12),
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
          const PgntLogo(size: 34),
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
  bool showCountryChoices = false;
  MobileOperator? selectedOperator;
  int selectedAmount = 100;
  int selectedTab = 0;
  bool isLoading = false;
  bool isQuoteLoading = false;
  Map<String, dynamic>? priceQuote;
  String? priceQuoteError;

  final TextEditingController phoneController =
      TextEditingController();
  final TextEditingController customAmountController = TextEditingController();
  final TextEditingController referralCodeController =
      TextEditingController();
  late final AppLinks _appLinks;
  StreamSubscription<Uri>? _referralLinkSubscription;
  final TextEditingController supportSubjectController =
      TextEditingController();
  final TextEditingController supportMessageController =
      TextEditingController();
  String? selectedSupportOrderId;
  String supportCategory = 'topup';
  bool isSubmittingSupport = false;
  final List<Map<String, dynamic>> supportTickets = [];
  bool isLoadingSupportTickets = false;

  static const String _historyStorageKey = 'pgnt_transaction_history_v1';
  static const String _tokensStorageKey = 'pgnt_order_access_tokens_v1';
  final FlutterSecureStorage _secureStorage = const FlutterSecureStorage();
  final List<TopUpTransaction> transactions = [];
  final Map<String, String> _orderAccessTokens = {};
  final Set<String> _ordersBeingChecked = {};
  Future<void>? _restoreFuture;

  @override
  void initState() {
    super.initState();
    _restoreFuture = _restoreLocalData();
    _appLinks = AppLinks();
    _referralLinkSubscription = _appLinks.uriLinkStream.listen(
      _applyReferralUri,
      onError: (Object _) {},
    );
    _appLinks.getInitialLink().then((uri) {
      if (uri != null) _applyReferralUri(uri);
    }).catchError((Object _) {});
  }

  void _applyReferralUri(Uri uri) {
    if (!mounted) return;
    // Supported invite links use: pgntasian://referral?code=FRIEND2026
    if (uri.scheme.toLowerCase() != 'pgntasian' ||
        uri.host.toLowerCase() != 'referral') {
      return;
    }
    final code = (uri.queryParameters['code'] ??
            uri.queryParameters['referralCode'] ?? '')
        .trim()
        .toUpperCase();
    if (!RegExp(r'^[A-Z0-9_-]{4,40}$').hasMatch(code)) return;

    // Never overwrite a different code the user has already entered.
    final currentCode = referralCodeController.text.trim().toUpperCase();
    if (currentCode.isEmpty || currentCode == code) {
      referralCodeController.value = TextEditingValue(
        text: code,
        selection: TextSelection.collapsed(offset: code.length),
      );
    }
  }

  Future<void> _restoreLocalData() async {
    final restoredTransactions = <TopUpTransaction>[];
    final restoredTokens = <String, String>{};

    try {
      final preferences = await SharedPreferences.getInstance();
      final rawHistory = preferences.getString(_historyStorageKey);
      if (rawHistory != null) {
        final decoded = jsonDecode(rawHistory);
        if (decoded is List) {
          for (final entry in decoded) {
            if (entry is Map<String, dynamic>) {
              try {
                final transaction = TopUpTransaction.fromJson(entry);
                if (transaction.id.isNotEmpty) restoredTransactions.add(transaction);
              } catch (_) {
                // Skip a damaged history entry without losing other entries.
              }
            } else if (entry is Map) {
              try {
                final transaction = TopUpTransaction.fromJson(Map<String, dynamic>.from(entry));
                if (transaction.id.isNotEmpty) restoredTransactions.add(transaction);
              } catch (_) {
                // Skip a damaged history entry without losing other entries.
              }
            }
          }
        }
      }
    } catch (_) {
      // Keep the app usable if local history cannot be read.
    }

    try {
      final rawTokens = await _secureStorage.read(key: _tokensStorageKey);
      if (rawTokens != null) {
        final decoded = jsonDecode(rawTokens);
        if (decoded is Map) {
          for (final entry in decoded.entries) {
            final orderId = entry.key.toString();
            final token = entry.value?.toString() ?? '';
            if (RegExp(r'^[0-9a-f-]{36}$', caseSensitive: false).hasMatch(orderId) &&
                RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(token)) {
              restoredTokens[orderId] = token;
            }
          }
        }
      }
    } catch (_) {
      // Never expose tokens by falling back to plain-text preferences.
    }

    if (!mounted) return;
    setState(() {
      transactions
        ..clear()
        ..addAll(restoredTransactions);
      _orderAccessTokens
        ..clear()
        ..addAll(restoredTokens);
      selectedSupportOrderId ??= transactions
          .map((item) => item.orderId)
          .whereType<String>()
          .firstWhere(
            (orderId) => _orderAccessTokens.containsKey(orderId),
            orElse: () => '',
          );
      if (selectedSupportOrderId == '') selectedSupportOrderId = null;
    });
    await refreshAllOrderStatuses();
  }

  Future<void> _persistTransactions() async {
    final preferences = await SharedPreferences.getInstance();
    final saved = await preferences.setString(
      _historyStorageKey,
      jsonEncode(transactions.map((item) => item.toJson()).toList()),
    );
    if (!saved) throw StateError('Could not save transaction history on this device.');
  }

  Future<void> _persistAccessTokens() async {
    await _secureStorage.write(
      key: _tokensStorageKey,
      value: jsonEncode(_orderAccessTokens),
    );
  }

  String t(String key) => tr(languageCode, key);

  TransactionStatus _statusFromServer(
    dynamic value, {
    dynamic refundStatus,
  }) {
    final refund = refundStatus?.toString().trim().toLowerCase();
    if (refund == 'succeeded' || value?.toString().toLowerCase() == 'refunded') {
      return TransactionStatus.refunded;
    }
    if (refund == 'pending') {
      return TransactionStatus.refundPending;
    }
    if (refund != null && refund.isNotEmpty) {
      return TransactionStatus.refundNeedsReview;
    }
    switch (value?.toString().toLowerCase()) {
      case 'completed':
        return TransactionStatus.successful;
      case 'failed':
      case 'declined':
        return TransactionStatus.failed;
      case 'topup_review':
      case 'review':
        return TransactionStatus.underReview;
      default:
        return TransactionStatus.pending;
    }
  }

  Future<void> refreshOrderStatus(String orderId) async {
    final token = _orderAccessTokens[orderId];
    if (token == null || _ordersBeingChecked.contains(orderId)) return;
    _ordersBeingChecked.add(orderId);
    try {
      final uri = Uri.parse('$backendBaseUrl/api/orders/$orderId/status');
      final response = await http.get(uri, headers: {
        'Accept': 'application/json',
        'x-order-access-token': token,
      }).timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) return;
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) return;
      final nextStatus = _statusFromServer(
        decoded['status'],
        refundStatus: decoded['refundStatus'],
      );
      if (!mounted) return;
      final index = transactions.indexWhere((item) => item.orderId == orderId);
      if (index < 0) return;
      final current = transactions[index];
      if (current.status != nextStatus) {
        setState(() {
          transactions[index] = TopUpTransaction(
            id: current.id,
            phone: current.phone,
            countryCode: current.countryCode,
            operatorName: current.operatorName,
            amount: current.amount,
            currency: current.currency,
            fee: current.fee,
            bonus: current.bonus,
            status: nextStatus,
            createdAt: current.createdAt,
            orderId: current.orderId,
          );
        });
        try {
          await _persistTransactions();
        } catch (_) {
          // Keep the latest in-memory status if local storage is unavailable.
        }
      }
    } catch (_) {
      // Preserve the last known state when the network is temporarily unavailable.
    } finally {
      _ordersBeingChecked.remove(orderId);
    }
  }

  Future<void> _pollOrderStatus(String orderId) async {
    for (var attempt = 0; attempt < 8; attempt++) {
      await Future.delayed(const Duration(seconds: 4));
      if (!mounted) return;
      await refreshOrderStatus(orderId);
      final matches = transactions.where((entry) => entry.orderId == orderId);
      if (matches.isEmpty) return;
      final status = matches.first.status;
      if (status == TransactionStatus.successful ||
          status == TransactionStatus.failed ||
          status == TransactionStatus.underReview ||
          status == TransactionStatus.refundPending ||
          status == TransactionStatus.refunded ||
          status == TransactionStatus.refundNeedsReview) {
        return;
      }
    }
  }

  Future<void> refreshAllOrderStatuses() async {
    final ids = transactions
        .where((item) => item.orderId != null)
        .map((item) => item.orderId!)
        .toList();
    for (final id in ids) {
      await refreshOrderStatus(id);
    }
  }

  List<MobileOperator> get countryOperators => operators
      .where((item) => item.countryCode == selectedCountry.code)
      .toList();

  List<int> get amounts =>
      rechargeAmounts[selectedCountry.currency] ?? [100, 250, 500];

  @override
  void dispose() {
    _referralLinkSubscription?.cancel();
    phoneController.dispose();
    customAmountController.dispose();
    referralCodeController.dispose();
    supportSubjectController.dispose();
    supportMessageController.dispose();
    super.dispose();
  }

  String formatEuroCents(dynamic value) {
    final cents = value is num ? value.toInt() : int.tryParse('$value') ?? 0;
    return '€${(cents / 100).toStringAsFixed(2)}';
  }

  Future<void> loadPriceQuote() async {
    final operator = selectedOperator;
    if (operator == null) {
      if (mounted) setState(() { priceQuote = null; priceQuoteError = null; });
      return;
    }

    final countryCode = selectedCountry.code;
    final amount = selectedAmount;
    setState(() { isQuoteLoading = true; priceQuoteError = null; });

    try {
      final uri = Uri.parse('$backendBaseUrl/api/pricing/quote').replace(
        queryParameters: {
          'country': countryCode,
          'operator': operator.name,
          'amount': '$amount',
        },
      );

      final response = await http
          .get(uri, headers: const {'Accept': 'application/json'})
          .timeout(const Duration(seconds: 60));

      dynamic decoded;
      try {
        decoded = jsonDecode(response.body);
      } on FormatException {
        throw Exception(
          'HTTP ${response.statusCode}: سرور JSON نه دی را لېږلی.',
        );
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        final message = decoded is Map<String, dynamic>
            ? decoded['error']?.toString()
            : null;
        throw Exception(
          'HTTP ${response.statusCode}: ${(message == null || message.isEmpty) ? 'قیمت ترلاسه نه شو' : message}',
        );
      }

      if (decoded is! Map<String, dynamic>) {
        throw Exception('HTTP ${response.statusCode}: د سرور ځواب ناسم جوړښت لري.');
      }

      if (!mounted ||
          countryCode != selectedCountry.code ||
          amount != selectedAmount ||
          operator.name != selectedOperator?.name) {
        return;
      }

      setState(() {
        priceQuote = decoded;
        priceQuoteError = null;
      });
    } catch (error) {
      if (!mounted ||
          countryCode != selectedCountry.code ||
          amount != selectedAmount ||
          operator.name != selectedOperator?.name) {
        return;
      }

      final detail = error.toString().replaceFirst('Exception: ', '').trim();
      final String safeDetail;
      if (error is FormatException) {
        safeDetail = 'د سرور ځواب د لوستلو وړ نه دی.';
      } else if (detail.contains('TimeoutException')) {
        safeDetail = 'د سرور ځواب ناوخته شو (timeout).';
      } else if (detail.contains('SocketException') ||
          detail.contains('HandshakeException')) {
        safeDetail = 'له سرور سره اړیکه جوړه نه شوه: ${detail.length > 100 ? detail.substring(0, 100) : detail}';
      } else if (detail.isEmpty) {
        safeDetail = 'ناپېژندل شوې ستونزه.';
      } else {
        safeDetail = detail.length > 150 ? detail.substring(0, 150) : detail;
      }

      setState(() {
        priceQuote = null;
        priceQuoteError = 'قیمت تایید نه شو: $safeDetail';
      });
    } finally {
      if (mounted &&
          countryCode == selectedCountry.code &&
          amount == selectedAmount &&
          operator.name == selectedOperator?.name) {
        setState(() => isQuoteLoading = false);
      }
    }
  }

  void selectCountry(AppCountry? country) {
    if (country == null) return;

    setState(() {
      selectedCountry = country;
      selectedOperator = null;
      selectedAmount =
          (rechargeAmounts[country.currency] ?? [100]).first;
      phoneController.clear();
      customAmountController.clear();
      priceQuote = null;
      priceQuoteError = null;
    });
  }

  void handlePhoneChanged(String value) {
    if (mounted) setState(() {});
    if (selectedCountry.code != 'AF') return;
    final detectedName = detectAfghanOperator(value);
    if (detectedName == null) return;

    MobileOperator? detected;
    for (final operator in countryOperators) {
      if (operator.name.toLowerCase() == detectedName.toLowerCase()) {
        detected = operator;
        break;
      }
    }
    if (detected == null ||
        (selectedOperator?.name == detected.name &&
            selectedOperator?.countryCode == detected.countryCode)) {
      return;
    }

    setState(() {
      selectedOperator = detected;
      priceQuote = null;
      priceQuoteError = null;
    });
    loadPriceQuote();
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
        selectedIndex: selectedTab >= 4 ? 0 : selectedTab,
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
          _buildStepHeader(1, t('selectCountry')),
          buildCountrySelector(),
          const SizedBox(height: 18),
          _buildStepHeader(2, t('phone')),
          buildPhoneField(),
          const SizedBox(height: 18),
          _buildStepHeader(3, t('selectOperator')),
          buildOperatorSelector(),
          const SizedBox(height: 18),
          _buildStepHeader(4, t('amount')),
          buildAmountSelector(),
          const SizedBox(height: 10),
          buildCustomAmountField(),
          const SizedBox(height: 14),
          buildPriceCard(),
          const SizedBox(height: 18),
          _buildStepHeader(5, t('review')),
          buildReviewSummary(),
          const SizedBox(height: 12),
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
    Widget countryCard(AppCountry country, double width) {
      final selected = country.code == selectedCountry.code;
      return InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () {
          if (selected) {
            setState(() => showCountryChoices = false);
          } else {
            selectCountry(country);
            setState(() => showCountryChoices = false);
          }
        },
        child: Container(
          width: width,
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? const Color(0xFFFFF1F0) : cardWhite,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
              color: selected ? primaryRed : const Color(0xFFE7DED2),
              width: selected ? 1.7 : 1,
            ),
          ),
          child: Row(
            children: [
              Text(country.flag, style: const TextStyle(fontSize: 27)),
              const SizedBox(width: 9),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      country.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: selected ? primaryRed : Colors.black87,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      country.currency,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Colors.black54,
                      ),
                    ),
                  ],
                ),
              ),
              if (selected)
                const Icon(Icons.check_circle, color: primaryRed, size: 18),
            ],
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        if (!showCountryChoices) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              countryCard(selectedCountry, constraints.maxWidth),
              Align(
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  onPressed: () => setState(() => showCountryChoices = true),
                  icon: const Icon(Icons.public, size: 18),
                  label: Text(t('changeCountry')),
                ),
              ),
            ],
          );
        }

        final cardWidth = (constraints.maxWidth - 12) / 2;
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: countries
                  .map((country) => countryCard(country, cardWidth))
                  .toList(),
            ),
            Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => setState(() => showCountryChoices = false),
                icon: const Icon(Icons.check, size: 18),
                label: Text(t('changeCountry')),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget buildReferralCodeField() {
    return TextField(
      controller: referralCodeController,
      textCapitalization: TextCapitalization.characters,
      autocorrect: false,
      enableSuggestions: false,
      maxLength: 40,
      decoration: InputDecoration(
        labelText: t('referralCode'),
        hintText: t('referralCode'),
        helperText: t('referralHint'),
        prefixIcon: const Icon(Icons.card_giftcard, color: primaryRed),
        counterText: '',
      ),
    );
  }

  Widget buildPhoneField() {
    final phoneHint = switch (selectedCountry.code) {
      'AF' => '07X XXX XXXX',
      'PK' => '03XX XXXXXXX',
      'IN' => '10-digit mobile number',
      'BD' => '01XXXXXXXXX',
      _ => 'Mobile number',
    };
    return TextField(
      controller: phoneController,
      keyboardType: TextInputType.phone,
      maxLength: 16,
      onChanged: handlePhoneChanged,
      decoration: InputDecoration(
        hintText: phoneHint,
        helperText: 'Enter the recipient number for ${selectedCountry.name}',
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
    if (countryOperators.isEmpty) {
      return Text(t('selectOperator'));
    }
    return LayoutBuilder(
      builder: (context, constraints) {
        final columns = 2;
        final spacing = 8.0;
        final cardWidth =
            (constraints.maxWidth - spacing * (columns - 1)) / columns;
        return Wrap(
          spacing: spacing,
          runSpacing: spacing,
          children: countryOperators.map((item) {
            final selected = selectedOperator?.name == item.name &&
                selectedOperator?.countryCode == item.countryCode;
            return InkWell(
              borderRadius: BorderRadius.circular(13),
              onTap: () {
                setState(() {
                  selectedOperator = item;
                  priceQuote = null;
                  priceQuoteError = null;
                });
                loadPriceQuote();
              },
              child: Container(
                width: cardWidth,
                padding: const EdgeInsets.symmetric(
                  horizontal: 6,
                  vertical: 12,
                ),
                decoration: BoxDecoration(
                  color: selected ? const Color(0xFFFFF1F0) : cardWhite,
                  borderRadius: BorderRadius.circular(13),
                  border: Border.all(
                    color: selected ? primaryRed : const Color(0xFFE7DED2),
                    width: selected ? 1.6 : 1,
                  ),
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    OperatorBrandMark(
                      operator: item,
                      size: 30,
                    ),
                    const SizedBox(height: 7),
                    Text(
                      item.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w700,
                        color: selected ? primaryRed : Colors.black87,
                      ),
                    ),
                    if (selected)
                      const Padding(
                        padding: EdgeInsets.only(top: 4),
                        child: Icon(
                          Icons.check_circle,
                          color: primaryRed,
                          size: 15,
                        ),
                      ),
                  ],
                ),
              ),
            );
          }).toList(),
        );
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
            customAmountController.clear();
            setState(() { selectedAmount = amount; priceQuote = null; priceQuoteError = null; });
            loadPriceQuote();
          },
        );
      }).toList(),
    );
  }

  Widget _buildStepHeader(int number, String label) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(children: [
        Container(
          width: 32, height: 32, alignment: Alignment.center,
          decoration: const BoxDecoration(color: primaryRed, shape: BoxShape.circle),
          child: Text('$number', style: const TextStyle(color: brightGold, fontWeight: FontWeight.w900)),
        ),
        const SizedBox(width: 10),
        Expanded(child: Text(label, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: primaryRed))),
      ]),
    );
  }

  Widget buildCustomAmountField() {
    void applyAmount(String raw) {
      final value = int.tryParse(raw.trim());
      if (value == null || value <= 0) {
        showMessage(t('invalidAmount'));
        return;
      }
      setState(() {
        selectedAmount = value;
        priceQuote = null;
        priceQuoteError = null;
      });
      loadPriceQuote();
    }

    return TextField(
      controller: customAmountController,
      keyboardType: TextInputType.number,
      decoration: InputDecoration(
        labelText: '${t('customAmount')} (${selectedCountry.currency})',
        hintText: t('amount'),
        prefixIcon: const Icon(Icons.edit_outlined, color: primaryRed),
        suffixIcon: IconButton(
          tooltip: 'Check amount and price',
          icon: const Icon(Icons.check_circle_outline, color: primaryRed),
          onPressed: () => applyAmount(customAmountController.text),
        ),
      ),
      onChanged: (_) {
        if (priceQuote != null) {
          setState(() {
            priceQuote = null;
            priceQuoteError = null;
          });
        }
      },
      onSubmitted: applyAmount,
    );
  }

  Widget buildReviewSummary() {
    final quote = priceQuote;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(15),
        child: Column(children: [
          _reviewRow(t('selectCountry'), '${selectedCountry.flag} ${selectedCountry.name}'),
          const Divider(height: 18),
          _reviewRow(t('phone'), phoneController.text.isEmpty ? '—' : phoneController.text),
          const Divider(height: 18),
          _reviewRow(t('selectOperator'), selectedOperator?.name ?? '—'),
          const Divider(height: 18),
          _reviewRow(t('amount'), '$selectedAmount ${selectedCountry.currency}'),
          const Divider(height: 18),
          _reviewRow(t('total'), quote?['formattedFinalPrice']?.toString() ?? t('priceNote')),
          if (quote == null)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Text(t('priceNote'), style: const TextStyle(color: errorRed, fontSize: 12), textAlign: TextAlign.center),
            ),
        ]),
      ),
    );
  }

  Widget _reviewRow(String label, String value) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(child: Text(label, style: const TextStyle(color: Colors.black54))),
        const SizedBox(width: 12),
        Flexible(child: Text(value, textAlign: TextAlign.end, style: const TextStyle(fontWeight: FontWeight.w700))),
      ],
    );
  }

  Widget buildPriceCard() {
    final quote = priceQuote;
    final basePrice = quote == null ? null : quote['formattedBasePrice'];
    final fee = quote == null ? null : quote['formattedFee'];
    final total = quote == null ? null : quote['formattedFinalPrice'];
    final bonusPercent = quote == null ? null : quote['bonusPercent'];
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          Row(children: [
            const Text('€', style: TextStyle(color: primaryRed, fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(width: 10), Expanded(child: Text(t('price'))),
            Text(basePrice is String ? basePrice : '—', style: const TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(width: 8),
            Text('$selectedAmount ${selectedCountry.currency}', style: const TextStyle(fontWeight: FontWeight.bold)),
          ]),
          if (quote != null && selectedCountry.code == 'AF') ...[
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.currency_exchange, color: primaryRed),
              const SizedBox(width: 10),
              const Expanded(child: Text('د بازار اټکلي معادل')),
              Text(quote['marketEquivalentEurFormatted'] is String ? quote['marketEquivalentEurFormatted'] as String : '—', style: const TextStyle(fontWeight: FontWeight.w600)),
            ]),
            Row(children: [
              const SizedBox(width: 34),
              const Expanded(child: Text('د تبادلې نرخ', style: TextStyle(fontSize: 12, color: Colors.black54))),
              Text(quote['exchangeRateAfnPerEur'] is num ? '1 € = ${quote['exchangeRateAfnPerEur']} AFN' : '—', style: const TextStyle(fontSize: 12, color: Colors.black54)),
            ]),
          ],
          pgntGoldDivider(),
          Row(children: [const Icon(Icons.receipt_outlined, color: primaryRed), const SizedBox(width: 10), Expanded(child: Text(t('fee'))), Text(fee is String ? fee : '—')]),
          const SizedBox(height: 12),
          Row(children: [const Icon(Icons.card_giftcard, color: primaryRed), const SizedBox(width: 10), Expanded(child: Text(t('bonus'))), Text(bonusPercent is num && bonusPercent > 0 ? '${bonusPercent.toString()}%' : '—')]),
          if (quote != null) ...[
            pgntGoldDivider(),
            Row(children: [Expanded(child: Text('ټول تادیه', style: const TextStyle(fontWeight: FontWeight.bold))), Text(total is String ? total : '—', style: const TextStyle(color: primaryRed, fontWeight: FontWeight.bold, fontSize: 18))]),
          ],
          const SizedBox(height: 12),
          Text(isQuoteLoading ? 'د سرور تایید شوی قیمت ترلاسه کېږي...' : (priceQuoteError ?? (quote == null ? 'د یورو قیمت، فیس او بونس لپاره هېواد، آپرېټر او اندازه وټاکئ.' : 'قیمت، فیس او بونس د سرور له تایید شوي نرخ څخه ښودل کېږي.')), style: TextStyle(color: priceQuoteError == null ? Colors.black54 : errorRed, fontSize: 12), textAlign: TextAlign.center),
        ]),
      ),
    );
  }

  Widget buildPaymentButton() {
    return ElevatedButton.icon(
      onPressed: (isLoading || priceQuote == null || isQuoteLoading) ? null : startPayment,
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
    await _restoreFuture;
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
              'productId': priceQuote?['productId'],
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
      final orderId = decoded['orderId']?.toString();
      final accessToken = decoded['orderAccessToken']?.toString();

      if (rawUrl is! String || rawUrl.isEmpty) {
        throw Exception('Checkout URL is missing');
      }
      if (orderId == null ||
          !RegExp(r'^[0-9a-f-]{36}$', caseSensitive: false).hasMatch(orderId) ||
          accessToken == null ||
          !RegExp(r'^[a-f0-9]{64}$', caseSensitive: false).hasMatch(accessToken)) {
        throw Exception('Secure order tracking information is missing');
      }

      final paymentUri = Uri.tryParse(rawUrl);

      if (paymentUri == null || paymentUri.scheme != 'https') {
        throw Exception('Invalid payment URL');
      }

      if (!mounted) return;

      // Save the order and its access token before opening the external
      // payment app, so closing or backgrounding the app does not lose them.
      _orderAccessTokens[orderId] = accessToken;
      setState(() {
        selectedSupportOrderId ??= orderId;
        transactions.removeWhere((item) => item.orderId == orderId);
        transactions.insert(
          0,
          TopUpTransaction(
            id: orderId,
            orderId: orderId,
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
      await _persistAccessTokens();
      await _persistTransactions();

      final opened = await launchUrl(
        paymentUri,
        mode: LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception('Could not open payment page');
      }

      await refreshOrderStatus(orderId);
      _pollOrderStatus(orderId);

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
      child: Column(
        children: [
          if (transactions.any((item) => item.orderId != null))
            Align(
              alignment: Alignment.centerRight,
              child: TextButton.icon(
                onPressed: refreshAllOrderStatuses,
                icon: const Icon(Icons.refresh),
                label: Text(t('retry')),
              ),
            ),
          Expanded(
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
          ),
        ],
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
  
  Future<void> submitSupportTicket() async {
    final orderId = selectedSupportOrderId;
    final subject = supportSubjectController.text.trim();
    final message = supportMessageController.text.trim();
    if (orderId == null || !_orderAccessTokens.containsKey(orderId)) {
      showMessage('لومړی له تاریخچې څخه خپله معامله انتخاب کړئ.');
      return;
    }
    if (subject.length < 4 || message.length < 10) {
      showMessage('موضوع او د ستونزې تشریح بشپړه ولیکئ.');
      return;
    }

    setState(() => isSubmittingSupport = true);
    try {
      final response = await http.post(
        Uri.parse('$backendBaseUrl/api/support/tickets'),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-order-access-token': _orderAccessTokens[orderId]!,
        },
        body: jsonEncode({
          'orderId': orderId,
          'subject': subject,
          'message': message,
          'category': supportCategory,
        }),
      ).timeout(const Duration(seconds: 20));

      final dynamic decoded = jsonDecode(response.body);
      if (response.statusCode != 201 || decoded is! Map<String, dynamic>) {
        final detail = decoded is Map<String, dynamic> ? decoded['error'] : null;
        throw Exception(detail is String ? detail : 'Support request failed.');
      }
      if (!mounted) return;
      supportSubjectController.clear();
      supportMessageController.clear();
      await loadSupportTickets();
      showMessage('ستاسو د مرستې غوښتنه ثبت شوه. د ټکټ شمېره: ${(decoded['ticket'] as Map<String, dynamic>)['id']}');
    } catch (error) {
      if (!mounted) return;
      final detail = error.toString().replaceFirst('Exception: ', '').trim();
      showMessage(detail.isEmpty ? 'د مرستې غوښتنه ثبت نه شوه؛ بیا هڅه وکړئ.' : detail);
    } finally {
      if (mounted) setState(() => isSubmittingSupport = false);
    }
  }

  Future<void> loadSupportTickets() async {
    final orderId = selectedSupportOrderId;
    if (orderId == null) return;
    final token = _orderAccessTokens[orderId];
    if (token == null) return;
    if (mounted) setState(() => isLoadingSupportTickets = true);
    try {
      final response = await http.get(
        Uri.parse('$backendBaseUrl/api/support/tickets/order/$orderId'),
        headers: {
          'Accept': 'application/json',
          'x-order-access-token': token,
        },
      ).timeout(const Duration(seconds: 15));
      final dynamic decoded = jsonDecode(response.body);
      if (response.statusCode != 200 || decoded is! Map<String, dynamic>) {
        final detail = decoded is Map<String, dynamic> ? decoded['error'] : null;
        throw Exception(detail is String ? detail : 'Could not load support requests.');
      }
      final rawTickets = decoded['tickets'];
      if (rawTickets is! List) throw Exception('Invalid support history response.');
      final loaded = rawTickets
          .whereType<Map>()
          .map((item) => Map<String, dynamic>.from(item))
          .toList();
      if (!mounted || selectedSupportOrderId != orderId) return;
      setState(() {
        supportTickets
          ..clear()
          ..addAll(loaded);
      });
    } catch (error) {
      if (mounted) {
        final detail = error.toString().replaceFirst('Exception: ', '').trim();
        showMessage(detail.isEmpty ? 'د ټکټونو تاریخچه نه شوه لوستل کېدای.' : detail);
      }
    } finally {
      if (mounted) setState(() => isLoadingSupportTickets = false);
    }
  }

  Widget buildSupportTicketHistory() {
    final hasOrder = selectedSupportOrderId != null &&
        _orderAccessTokens.containsKey(selectedSupportOrderId);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const Expanded(
              child: Text(
                'زما د مرستې غوښتنې',
                style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
              ),
            ),
            IconButton(
              tooltip: 'تازه کول',
              onPressed: !hasOrder || isLoadingSupportTickets ? null : loadSupportTickets,
              icon: isLoadingSupportTickets
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.refresh_rounded),
            ),
          ],
        ),
        if (!hasOrder)
          const Text('د ټکټونو د کتلو لپاره خپله معامله انتخاب کړئ.')
        else if (supportTickets.isEmpty && !isLoadingSupportTickets)
          const Text('د دې معاملې لپاره د مرستې پخوانی ټکټ نشته. د تازه کولو نښه کېکاږئ.')
        else
          ...supportTickets.map((ticket) {
            final id = ticket['id']?.toString() ?? '—';
            final status = ticket['status']?.toString() ?? 'open';
            final category = ticket['category']?.toString() ?? 'other';
            final subject = ticket['subject']?.toString() ?? 'Support request';
            final message = ticket['message']?.toString() ?? '';
            final reply = ticket['admin_reply']?.toString() ?? '';
            return Card(
              margin: const EdgeInsets.only(bottom: 8),
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text('#$id • $subject',
                              style: const TextStyle(fontWeight: FontWeight.w700)),
                        ),
                        Chip(label: Text(status)),
                      ],
                    ),
                    Text('ډول: $category'),
                    const SizedBox(height: 6),
                    Text(message),
                    if (reply.trim().isNotEmpty) ...[
                      const Divider(),
                      const Text('د ملاتړ ځواب',
                          style: TextStyle(fontWeight: FontWeight.w700)),
                      Text(reply),
                    ],
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }

  Widget buildSupport() {
    final supportOrders = transactions
        .where((item) => item.orderId != null && _orderAccessTokens.containsKey(item.orderId))
        .toList();
    final faqs = <Map<String, String>>[
      {'q': t('faqCheckQ'), 'a': t('faqCheckA')},
      {'q': t('faqDelayQ'), 'a': t('faqDelayA')},
      {'q': t('faqFailQ'), 'a': t('faqFailA')},
      {'q': t('faqPaymentQ'), 'a': t('faqPaymentA')},
      {'q': t('faqPrivacyQ'), 'a': t('faqPrivacyA')},
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const PgntBrandHeader(),
        const SizedBox(height: 18),
        pgntSectionTitle(
          t('support'),
          Icons.support_agent_rounded,
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            gradient: const LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [primaryRed, darkRed],
            ),
            borderRadius: BorderRadius.circular(22),
            boxShadow: [
              BoxShadow(
                color: primaryRed.withValues(alpha: 0.18),
                blurRadius: 18,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    width: 52,
                    height: 52,
                    decoration: BoxDecoration(
                      color: gold.withValues(alpha: 0.16),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: gold.withValues(alpha: 0.55)),
                    ),
                    child: const Icon(
                      Icons.support_agent_rounded,
                      color: gold,
                      size: 30,
                    ),
                  ),
                  const SizedBox(width: 12),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'VIP Assistance',
                          style: TextStyle(
                            color: Colors.white,
                            fontSize: 20,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                        SizedBox(height: 5),
                        Text(
                          'Help Centre',
                          style: TextStyle(
                            color: gold,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              const Text(
                'Find guidance for payments, mobile top-ups and order problems.',
                style: TextStyle(color: Colors.white, height: 1.45),
              ),
              const SizedBox(height: 14),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _supportFeatureChip(Icons.question_answer_outlined, 'FAQs'),
                  _supportFeatureChip(Icons.receipt_long_outlined, 'Order guidance'),
                  _supportFeatureChip(Icons.lock_outline, 'Payment safety'),
                ],
              ),
              const SizedBox(height: 14),
              const Text(
                'Automated help is available at any time. Live-agent response depends on support availability.',
                style: TextStyle(color: Colors.white70, fontSize: 12, height: 1.4),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        pgntSectionTitle(
          'د مرستې غوښتنه ثبت کړئ',
          Icons.mark_email_unread_outlined,
        ),
        if (supportOrders.isEmpty)
          const Card(
            child: Padding(
              padding: EdgeInsets.all(16),
              child: Text(
                'د ټکټ ثبتولو لپاره باید لومړی یوه معامله پیل شوې وي. بیا د معاملې له تاریخچې څخه هماغه معامله انتخاب کړئ.',
                style: TextStyle(height: 1.45),
              ),
            ),
          )
        else ...[
          DropdownButtonFormField<String>(
            value: supportOrders.any((item) => item.orderId == selectedSupportOrderId)
                ? selectedSupportOrderId
                : supportOrders.first.orderId,
            decoration: const InputDecoration(
              labelText: 'د معاملې نمبر',
              prefixIcon: Icon(Icons.receipt_long_outlined),
            ),
            items: supportOrders.map((item) {
              final id = item.orderId!;
              return DropdownMenuItem<String>(
                value: id,
                child: Text('${id.substring(0, 8)} • ${item.operatorName}', overflow: TextOverflow.ellipsis),
              );
            }).toList(),
            onChanged: (value) {
              setState(() {
                selectedSupportOrderId = value;
                supportTickets.clear();
              });
              loadSupportTickets();
            },
          ),
          const SizedBox(height: 10),
          DropdownButtonFormField<String>(
            value: supportCategory,
            decoration: const InputDecoration(
              labelText: 'د ستونزې ډول',
              prefixIcon: Icon(Icons.category_outlined),
            ),
            items: const [
              DropdownMenuItem(value: 'payment', child: Text('تادیه')),
              DropdownMenuItem(value: 'topup', child: Text('موبایل چارج')),
              DropdownMenuItem(value: 'refund', child: Text('بېرته پیسې')),
              DropdownMenuItem(value: 'wallet', child: Text('والټ')),
              DropdownMenuItem(value: 'account', child: Text('حساب')),
              DropdownMenuItem(value: 'other', child: Text('نور')),
            ],
            onChanged: (value) {
              if (value != null) setState(() => supportCategory = value);
            },
          ),
          const SizedBox(height: 10),
          TextField(
            controller: supportSubjectController,
            maxLength: 160,
            decoration: const InputDecoration(
              labelText: 'د موضوع لنډ عنوان',
              prefixIcon: Icon(Icons.short_text_rounded),
            ),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: supportMessageController,
            minLines: 3,
            maxLines: 6,
            maxLength: 4000,
            decoration: const InputDecoration(
              labelText: 'ستونزه په تفصیل ولیکئ',
              alignLabelWithHint: true,
              prefixIcon: Icon(Icons.message_outlined),
            ),
          ),
          const SizedBox(height: 10),
          ElevatedButton.icon(
            onPressed: isSubmittingSupport ? null : submitSupportTicket,
            icon: isSubmittingSupport
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2, color: brightGold),
                  )
                : const Icon(Icons.send_rounded),
            label: Text(isSubmittingSupport ? 'ثبتېږي...' : 'د مرستې غوښتنه ولېږئ'),
          ),
        ],
        const SizedBox(height: 16),
        buildSupportTicketHistory(),
        const SizedBox(height: 20),
        pgntSectionTitle(
          'Quick help',
          Icons.flash_on_outlined,
        ),
        const SizedBox(height: 8),
        Card(
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Color(0x147A0C10),
              child: Icon(Icons.history_rounded, color: primaryRed),
            ),
            title: const Text(
              'Check an order',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'Open your history to see the latest available status.',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => selectedTab = 1),
          ),
        ),
        Card(
          child: ListTile(
            leading: const CircleAvatar(
              backgroundColor: Color(0x147A0C10),
              child: Icon(Icons.account_balance_wallet_outlined, color: primaryRed),
            ),
            title: const Text(
              'Payment and wallet',
              style: TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: const Text(
              'Review wallet information and payment guidance.',
            ),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => selectedTab = 2),
          ),
        ),
        const SizedBox(height: 20),
        pgntSectionTitle(
          t('faq'),
          Icons.quiz_outlined,
        ),
        const SizedBox(height: 8),
        ...faqs.map(
          (faq) => Card(
            margin: const EdgeInsets.only(bottom: 8),
            child: ExpansionTile(
              leading: const Icon(
                Icons.help_outline_rounded,
                color: primaryRed,
              ),
              title: Text(
                faq['q']!,
                style: const TextStyle(fontWeight: FontWeight.w600),
              ),
              childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(
                    faq['a']!,
                    style: const TextStyle(height: 1.45),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 12),
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: primaryRed.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: primaryRed.withValues(alpha: 0.12)),
          ),
          child: const Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Icon(Icons.info_outline, color: primaryRed),
              SizedBox(width: 10),
              Expanded(
                child: Text(
                  'For a failed or delayed order, save the transaction ID and receipt. Direct ticket submission and automatic refund review still require a connected support service.',
                  style: TextStyle(height: 1.4),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 16),
        const Center(
          child: Text(
            'PGNT ASIAN TOPUP • VIP Assistance',
            style: TextStyle(color: Colors.grey),
          ),
        ),
        const SizedBox(height: 8),
      ],
    );
  }

  Widget _supportFeatureChip(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: Colors.white.withValues(alpha: 0.10),
        borderRadius: BorderRadius.circular(30),
        border: Border.all(color: Colors.white24),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, color: gold, size: 16),
          const SizedBox(width: 6),
          Text(
            label,
            style: const TextStyle(color: Colors.white, fontSize: 12),
          ),
        ],
      ),
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
                Card(
                  child: ListTile(
                    leading: const Icon(Icons.person_outline, color: primaryRed),
                    title: const Text('Profile (optional)'),
                    subtitle: const Text('Add your details only if you want to.'),
                    trailing: const Icon(Icons.chevron_right),
                    onTap: () {
                      setState(() => selectedTab = 4);
                      Navigator.pop(sheetContext);
                    },
                  ),
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
