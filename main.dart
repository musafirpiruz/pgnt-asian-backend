import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PgntAsianApp());
}

// ============================================================
// PGNT ASIAN TOP UP
// Jigari Edition • VIP Premium
// ============================================================

const primaryRed = Color(0xFF7A0C10);
const gold = Color(0xFFD4B896);
const brightGold = Color(0xFFFFD700);
const nukhudi = Color(0xFFFFF8E7);
const beige = Color(0xFFF5E6C8);
const pageBg = Color(0xFFFFF8E7);

const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'https://pgnt-asian-backend.onrender.com',
);

// ============================================================
// DATA MODEL
// ============================================================

class TopUpRecord {
  final String country;
  final String phone;
  final int amount;
  final double fee;
  final DateTime date;
  final String status;

  TopUpRecord({
    required this.country,
    required this.phone,
    required this.amount,
    required this.fee,
    required this.date,
    required this.status,
  });
}

// ============================================================
// APP
// ============================================================

class PgntAsianApp extends StatefulWidget {
  const PgntAsianApp({super.key});

  @override
  State<PgntAsianApp> createState() => _PgntAsianAppState();
}

class _PgntAsianAppState extends State<PgntAsianApp> {
  String language = 'پښتو';

  final List<TopUpRecord> history = [];

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PGNT ASIAN TOP UP',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: pageBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryRed,
          primary: primaryRed,
          secondary: brightGold,
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: primaryRed,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
            borderSide: const BorderSide(color: gold),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
            borderSide: const BorderSide(color: gold),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(15),
            borderSide: const BorderSide(
              color: primaryRed,
              width: 2,
            ),
          ),
        ),
      ),
      home: HomePage(
        language: language,
        history: history,
        onLanguageChanged: (value) {
          setState(() => language = value);
        },
        onAddHistory: (record) {
          setState(() {
            history.insert(0, record);
          });
        },
      ),
    );
  }
}

// ============================================================
// HOME PAGE
// ============================================================

class HomePage extends StatefulWidget {
  final String language;
  final List<TopUpRecord> history;
  final ValueChanged<String> onLanguageChanged;
  final ValueChanged<TopUpRecord> onAddHistory;

  const HomePage({
    super.key,
    required this.language,
    required this.history,
    required this.onLanguageChanged,
    required this.onAddHistory,
  });

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String country = 'Afghanistan';
  String operator = 'Auto Detect';

  int? selectedAmount;

  final phoneController = TextEditingController();

  final countries = const [
    'Afghanistan',
    'Pakistan',
    'Bangladesh',
    'India',
  ];

  final languages = const [
    'پښتو',
    'دری',
    'اردو',
    'हिन्दी',
    'বাংলা',
    'English',
  ];

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  String get currency {
    switch (country) {
      case 'Pakistan':
        return 'PKR';
      case 'Bangladesh':
        return 'BDT';
      case 'India':
        return 'INR';
      default:
        return 'AFN';
    }
  }

  String get countryFlag {
    switch (country) {
      case 'Pakistan':
        return '🇵🇰';
      case 'Bangladesh':
        return '🇧🇩';
      case 'India':
        return '🇮🇳';
      default:
        return '🇦🇫';
    }
  }

  List<String> get operators {
    switch (country) {
      case 'Pakistan':
        return [
          'Auto Detect',
          'Jazz',
          'Zong',
          'Ufone',
          'Telenor',
        ];
      case 'Bangladesh':
        return [
          'Auto Detect',
          'Grameenphone',
          'Robi',
          'Banglalink',
        ];
      case 'India':
        return [
          'Auto Detect',
          'Airtel',
          'Jio',
          'Vi',
        ];
      default:
        return [
          'Auto Detect',
          'Roshan',
          'Etisalat',
          'MTN',
          'AWCC',
        ];
    }
  }

  List<int> get amounts {
    switch (country) {
      case 'Afghanistan':
        return [100, 250, 500, 1000];
      default:
        return [100, 250, 500, 1000];
    }
  }

  double get fee => 0.75;

  bool get validPhone {
    final number = phoneController.text
        .trim()
        .replaceAll(RegExp(r'\D'), '');

    return number.length >= 7;
  }

  double get selectedEuroPrice {
    if (selectedAmount == null) return 0;

    if (country == 'Afghanistan') {
      switch (selectedAmount) {
        case 100:
          return 1.64;
        case 250:
          return 3.89;
        case 500:
          return 7.49;
        case 1000:
          return 14.29;
      }
    }

    return 0;
  }

  int get bonusAmount {
    if (country != 'Afghanistan' || selectedAmount == null) {
      return 0;
    }

    switch (selectedAmount) {
      case 100:
        return 10;
      case 250:
        return 35;
      case 500:
        return 80;
      default:
        return 0;
    }
  }

  void continueTopUp() {
    if (!validPhone) {
      _showMessage('مهرباني وکړئ د موبایل صحیح شمېره دننه کړئ.');
      return;
    }

    if (selectedAmount == null) {
      _showMessage('مهرباني وکړئ مقدار انتخاب کړئ.');
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          country: country,
          phone: phoneController.text.trim(),
          amount: selectedAmount!,
          currency: currency,
          fee: fee,
          onCompleted: widget.onAddHistory,
        ),
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  void showHistory() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HistoryPage(
          records: widget.history,
        ),
      ),
    );
  }

  void showWallet() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: nukhudi,
      builder: (_) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.account_balance_wallet,
                  color: primaryRed,
                  size: 42,
                ),
                const SizedBox(height: 10),
                const Text(
                  'زما والټ',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w900,
                    color: primaryRed,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '€24.50',
                  style: TextStyle(
                    fontSize: 34,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  '2% بونس فعال',
                  style: TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 18),
                const Text(
                  'Wallet کې پیسې وساته او 2% اضافه بونس وګټه.',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () {
                      Navigator.pop(context);
                      _showMessage(
                        'د Wallet اضافه کولو برخه به د Payment سیستم سره وصل شي.',
                      );
                    },
                    icon: const Icon(Icons.add),
                    label: const Text('پیسې اضافه کړئ'),
                    style: FilledButton.styleFrom(
                      backgroundColor: primaryRed,
                      minimumSize: const Size.fromHeight(52),
                    ),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  void showReferral() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      backgroundColor: nukhudi,
      builder: (_) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                const Text(
                  'شیر کړئ او 50 AFN بونس ترلاسه کړئ',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    fontSize: 21,
                    fontWeight: FontWeight.w900,
                    color: primaryRed,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'له ملګرو سره شریک کړئ • PGNT VIP Rewards',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                Container(
                  padding: const EdgeInsets.all(15),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(15),
                    border: Border.all(color: gold),
                  ),
                  child: const Text(
                    'PGNT ASIAN TOP UP\n'
                    'https://pgnt-asian.com/ref',
                    textAlign: TextAlign.center,
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(height: 14),
                FilledButton.icon(
                  onPressed: () {
                    Clipboard.setData(
                      const ClipboardData(
                        text: 'PGNT ASIAN TOP UP - PGNT VIP Rewards',
                      ),
                    );

                    Navigator.pop(context);

                    _showMessage('Referral معلومات Copy شول.');
                  },
                  icon: const Icon(Icons.share),
                  label: const Text('له ملګرو سره شریک کړئ'),
                  style: FilledButton.styleFrom(
                    backgroundColor: primaryRed,
                    minimumSize: const Size.fromHeight(52),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'PGNT ASIAN',
          style: TextStyle(
            fontWeight: FontWeight.w900,
          ),
        ),
        actions: [
          IconButton(
            tooltip: 'Wallet',
            onPressed: showWallet,
            icon: const Icon(
              Icons.account_balance_wallet_outlined,
            ),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.language),
            onSelected: widget.onLanguageChanged,
            itemBuilder: (_) {
              return languages
                  .map(
                    (language) => PopupMenuItem<String>(
                      value: language,
                      child: Text(language),
                    ),
                  )
                  .toList();
            },
          ),
          IconButton(
            tooltip: 'History',
            onPressed: showHistory,
            icon: const Icon(Icons.history),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const _VipHeader(),
              const SizedBox(height: 14),

              // WALLET
              InkWell(
                onTap: showWallet,
                borderRadius: BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient: const LinearGradient(
                      colors: [
                        primaryRed,
                        Color(0xFF9D181D),
                      ],
                    ),
                    borderRadius: BorderRadius.circular(20),
                    boxShadow: const [
                      BoxShadow(
                        blurRadius: 12,
                        offset: Offset(0, 5),
                        color: Color(0x30000000),
                      ),
                    ],
                  ),
                  child: const Row(
                    children: [
                      CircleAvatar(
                        radius: 27,
                        backgroundColor: brightGold,
                        child: Icon(
                          Icons.account_balance_wallet,
                          color: primaryRed,
                          size: 28,
                        ),
                      ),
                      SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                              'زما والټ',
                              style: TextStyle(
                                color: Colors.white,
                                fontSize: 16,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              '€24.50',
                              style: TextStyle(
                                color: brightGold,
                                fontSize: 25,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment: CrossAxisAlignment.end,
                        children: [
                          Text(
                            '2% بونس فعال',
                            style: TextStyle(
                              color: brightGold,
                              fontWeight: FontWeight.w900,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'پیسې اضافه کړئ',
                            style: TextStyle(
                              color: Colors.white,
                              fontSize: 12,
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 22),

              const _SectionTitle(
                title: 'هیواد انتخاب کړئ',
              ),
              const SizedBox(height: 8),

              DropdownButtonFormField<String>(
                value: country,
                decoration: InputDecoration(
                  prefixIcon: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      countryFlag,
                      style: const TextStyle(fontSize: 23),
                    ),
                  ),
                  labelText: 'Country',
                ),
                items: countries
                    .map(
                      (item) => DropdownMenuItem(
                        value: item,
                        child: Text(item),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) return;

                  setState(() {
                    country = value;
                    operator = 'Auto Detect';
                    selectedAmount = null;
                  });
                },
              ),

              const SizedBox(height: 18),

              const _SectionTitle(
                title: 'موبایل شمیره دننه کړئ',
              ),
              const SizedBox(height: 8),

              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  prefixIcon: const Icon(
                    Icons.phone_android,
                    color: primaryRed,
                  ),
                  hintText: country == 'Afghanistan'
                      ? '07xxxxxxxx'
                      : 'Enter mobile number',
                  suffixIcon: validPhone
                      ? const Icon(
                          Icons.check_circle,
                          color: Colors.green,
                        )
                      : null,
                ),
              ),

              const SizedBox(height: 18),

              const _SectionTitle(
                title: 'Operator',
              ),
              const SizedBox(height: 8),

              DropdownButtonFormField<String>(
                value: operator,
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.sim_card,
                    color: primaryRed,
                  ),
                ),
                items: operators
                    .map(
                      (item) => DropdownMenuItem(
                        value: item,
                        child: Text(item),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  setState(() {
                    operator = value ?? 'Auto Detect';
                  });
                },
              ),

              const SizedBox(height: 18),

              const _SectionTitle(
                title: 'مقدار انتخاب او واستوئ',
              ),
              const SizedBox(height:10),

              GridView.count(
                crossAxisCount: 2,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 10,
                mainAxisSpacing: 10,
                childAspectRatio: 2.25,
                children: amounts.map((amount) {
                  final selected = selectedAmount == amount;

                  return InkWell(
                    onTap: () {
                      setState(() {
                        selectedAmount = amount;
                      });
                    },
                    borderRadius: BorderRadius.circular(16),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 180),
                      decoration: BoxDecoration(
                        color: selected
                            ? brightGold
                            : Colors.white,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(
                          color: selected
                              ? primaryRed
                              : gold,
                          width: selected ? 2 : 1,
                        ),
                      ),
                      child: Center(
                        child: Column(
                          mainAxisAlignment:
                              MainAxisAlignment.center,
                          children: [
                            Text(
                              '$amount $currency',
                              style: TextStyle(
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                                color: selected
                                    ? primaryRed
                                    : Colors.black87,
                              ),
                            ),
                            if (country == 'Afghanistan' &&
                                amount != 1000)
                              Text(
                                '+${_bonusFor(amount)} BONUS',
                                style: const TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w800,
                                  color: primaryRed,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),

              const SizedBox(height: 18),

              _PriceCard(
                amount: selectedAmount,
                currency: currency,
                euroPrice: selectedEuroPrice,
                fee: fee,
                bonus: bonusAmount,
              ),

              const SizedBox(height: 18),

              FilledButton(
                onPressed: continueTopUp,
                style: FilledButton.styleFrom(
                  backgroundColor: primaryRed,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(58),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
                child: Text(
                  selectedAmount == null
                      ? 'ټاپ اپ واستوئ • €0.00'
                      : 'ټاپ اپ واستوئ',
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),

              const SizedBox(height: 16),

              OutlinedButton.icon(
                onPressed: showReferral,
                icon: const Icon(
                  Icons.card_giftcard,
                  color: primaryRed,
                ),
                label: const Text(
                  'شیر کړئ او 50 AFN بونس ترلاسه کړئ',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                    color: primaryRed,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(52),
                  side: const BorderSide(color: gold),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(15),
                  ),
                ),
              ),

              const SizedBox(height: 18),

              const Row(
                children: [
                  Expanded(
                    child: _SecurityItem(
                      icon: Icons.verified_user,
                      title: '۱۰۰٪ خوندي',
                    ),
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: _SecurityItem(
                      icon: Icons.flash_on,
                      title: 'فوري تحویل',
                    ),
                  ),
                  SizedBox(width: 8),
                  Expanded(
                    child: _SecurityItem(
                      icon: Icons.support_agent,
                      title: '24/7 Support',
                    ),
                  ),
                ],
              ),

              const SizedBox(height: 20),

              OutlinedButton.icon(
                onPressed: showHistory,
                icon: const Icon(Icons.receipt_long),
                label: const Text(
                  'Transaction History',
                  style: TextStyle(
                    fontWeight: FontWeight.w700,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(50),
                ),
              ),

              const SizedBox(height: 25),

              const Divider(color: gold),

              const SizedBox(height: 15),

              const Text(
                'PGNT ASIAN TOP UP',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: primaryRed,
                  fontSize: 18,
                  fontWeight: FontWeight.w900,
                ),
              ),

              const SizedBox(height: 5),

              const Text(
                'Jigari Edition • VIP Premium',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.black87,
                  fontWeight: FontWeight.w700,
                ),
              ),

              const SizedBox(height: 5),

              const Text(
                'Afghanistan • Pakistan • Bangladesh • India',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.black54,
                  fontSize: 12,
                ),
              ),

              const SizedBox(height: 5),

              const Text(
                '4.9★ • 10s
                Delivery • 24/7 Support',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: primaryRed,
                  fontWeight: FontWeight.w700,
                  fontSize: 12,
                ),
              ),

              const SizedBox(height: 5),

              const Text(
                '© 2025 PGNT ASIAN TOP UP • Final Jigari Version',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.black45,
                  fontSize: 11,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  int _bonusFor(int amount) {
    switch (amount) {
      case 100:
        return 10;
      case 250:
        return 35;
      case 500:
        return 80;
      default:
        return 0;
    }
  }
}

// ============================================================
// VIP HEADER
// ============================================================

class _VipHeader extends StatelessWidget {
  const _VipHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: primaryRed,
        borderRadius: BorderRadius.circular(24),
        boxShadow: const [
          BoxShadow(
            blurRadius: 12,
            offset: Offset(0, 5),
            color: Color(0x30000000),
          ),
        ],
      ),
      child: Row(
        children: [
          Container(
            width: 65,
            height: 65,
            decoration: BoxDecoration(
              color: brightGold,
              borderRadius: BorderRadius.circular(18),
            ),
            child: const Center(
              child: Text(
                'PG',
                style: TextStyle(
                  color: primaryRed,
                  fontSize: 25,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'PGNT ASIAN',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 22,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 3),
                Text(
                  'Jigari Edition • VIP Premium',
                  style: TextStyle(
                    color: brightGold,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                SizedBox(height: 5),
                Text(
                  'Fast • Secure • Asian Top Up',
                  style: TextStyle(
                    color: Colors.white70,
                    fontSize: 12,
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

// ============================================================
// PRICE CARD
// ============================================================

class _PriceCard extends StatelessWidget {
  final int? amount;
  final String currency;
  final double euroPrice;
  final double fee;
  final int bonus;

  const _PriceCard({
    required this.amount,
    required this.currency,
    required this.euroPrice,
    required this.fee,
    required this.bonus,
  });

  @override
  Widget build(BuildContext context) {
    if (amount == null) {
      return Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: beige,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: gold),
        ),
        child: const Row(
          children: [
            Icon(
              Icons.info_outline,
              color: primaryRed,
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                  'مقدار انتخاب کړئ تر څو قیمت ښکاره شي.',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
    }

    return Container(
      padding: const EdgeInsets.all(17),
      decoration: BoxDecoration(
        color: beige,
        borderRadius: BorderRadius.circular(18),
        border: Border.all(
          color: gold,
        ),
      ),
      child: Column(
        children: [
          Row(
            mainAxisAlignment:
                MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Top-up amount',
                style: TextStyle(
                  color: Colors.black54,
                ),
              ),
              Text(
                '$amount $currency',
                style: const TextStyle(
                  fontSize: 17,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            mainAxisAlignment:
                MainAxisAlignment.spaceBetween,
            children: [
              const Text(
                'Service fee',
                style: TextStyle(
                  color: Colors.black54,
                ),
              ),
              Text(
                '€${fee.toStringAsFixed(2)}',
                style: const TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          if (euroPrice > 0) ...[
            const Divider(color: gold),
            Row(
              mainAxisAlignment:
                  MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Price',
                  style: TextStyle(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                Text(
                  '€${euroPrice.toStringAsFixed(2)}',
                  style: const TextStyle(
                    color: primaryRed,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ],
          if (bonus > 0) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisAlignment:
                  MainAxisAlignment.center,
              children: [
                const Icon(
                  Icons.card_giftcard,
                  size: 18,
                  color: Colors.green,
                ),
                const SizedBox(width: 5),
                Text(
                  '+$bonus AFN BONUS',
                  style: const TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

// ============================================================
// SECURITY ITEM
// ============================================================

class _SecurityItem extends StatelessWidget {
  final IconData icon;
  final String title;

  const _SecurityItem({
    required this.icon,
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: 12,
        horizontal: 5,
      ),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: gold),
      ),
      child: Column(
        children: [
          Icon(
            icon,
            color: primaryRed,
            size: 24,
          ),
          const SizedBox(height: 5),
          Text(
            title,
            textAlign: TextAlign.center,
            style: const TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// SECTION TITLE
// ============================================================

class _SectionTitle extends StatelessWidget {
  final String title;

  const _SectionTitle({
    required this.title,
  });

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        color: primaryRed,
        fontSize: 16,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

//
============================================================
// CHECKOUT PAGE
// ============================================================

class CheckoutPage extends StatefulWidget {
  final String country;
  final String phone;
  final int amount;
  final String currency;
  final double fee;
  final ValueChanged<TopUpRecord> onCompleted;

  const CheckoutPage({
    super.key,
    required this.country,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.fee,
    required this.onCompleted,
  });

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  bool processing = false;

  Future<void> startStripeCheckout() async {
    if (backendBaseUrl.contains('YOUR-BACKEND-DOMAIN')) {
      _showError('Backend URL is not configured yet.');
      return;
    }

    setState(() => processing = true);

    try {
      final response = await http
          .post(
            Uri.parse(
              '$backendBaseUrl/api/payments/checkout',
            ),
            headers: const {
              'Content-Type': 'application/json',
            },
            body: jsonEncode({
              'country': _countryCode(widget.country),
              'phone': widget.phone,
              'amount': widget.amount,
            }),
          )
          .timeout(
            const Duration(seconds: 30),
          );

      final data =
          jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Checkout failed.',
        );
      }

      final checkoutUrl =
          data['checkoutUrl']?.toString();

      if (checkoutUrl == null ||
          checkoutUrl.isEmpty) {
        throw Exception(
          'Stripe Checkout URL was not returned.',
        );
      }

      final uri = Uri.tryParse(checkoutUrl);

      if (uri == null ||
          !await canLaunchUrl(uri)) {
        throw Exception(
          'Could not open Stripe Checkout.',
        );
      }

      await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      );

      if (!mounted) return;

      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text(
            'Stripe Checkout opened',
          ),
          content: const Text(
            'Complete your payment in the browser.\n\n'
            'After payment, Stripe will notify the secure backend. '
            'The backend—not the app—will handle the DT One top-up.',
          ),
          actions: [
            TextButton(
              onPressed: () {
                Navigator.pop(context);
              },
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) {
        _showError(
          e.toString().replaceFirst(
                'Exception: ',
                '',
              ),
        );
      }
    } finally {
      if (mounted) {
        setState(() => processing = false);
      }
    }
  }

  String _countryCode(String country) {
    switch (country) {
      case 'Afghanistan':
        return 'AF';
      case 'Pakistan':
        return 'PK';
      case 'Bangladesh':
        return 'BD';
      case 'India':
        return 'IN';
      default:
        return country.substring(0, 2).toUpperCase();
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Confirm Top-up',
          style: TextStyle(
            fontWeight: FontWeight.w800,
          ),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            _SummaryRow(
              label: 'Country',
              value: widget.country,
            ),
            _SummaryRow(
              label: 'Phone',
              value: widget.phone,
            ),
            _SummaryRow(
              label: 'Amount',
              value:
                  '${widget.amount} ${widget.currency}',
            ),
            _SummaryRow(
              label: 'Service fee',
              value:
                  '€${widget.fee.toStringAsFixed(2)}',
            ),
            const Spacer(),
            const Icon(
              Icons.lock_outline,
              color: primaryRed,
              size: 38,
            ),
            const SizedBox(height: 8),
            const Text(
              'Secure payment with Stripe',
              style: TextStyle(
                fontSize: 18,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'After successful payment, the secure backend '
              'will process the DT One top-up.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.black54,
              ),
            ),
            const SizedBox(height: 18),
            FilledButton(
              onPressed: processing
                  ? null
                  : startStripeCheckout,
              style: FilledButton.styleFrom(
                backgroundColor: primaryRed,
                minimumSize:
                    const Size.fromHeight(56),
              ),
              child: processing
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child:
                          CircularProgressIndicator(
                        color: Colors.white,
                        strokeWidth: 2.5,
                      ),
                    )
                  : const Text(
                      'Confirm & Pay with Stripe',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

// ============================================================
// SUMMARY ROW
// ============================================================

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({
    required this.label,
    required this.value,
  });

  @override
Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(
        vertical: 14,
      ),
      decoration: const BoxDecoration(
        border: Border(
          bottom: BorderSide(
            color: Color(0xFFE5DDD3),
          ),
        ),
      ),
      child: Row(
        mainAxisAlignment:
            MainAxisAlignment.spaceBetween,
        children: [
          Text(
            label,
            style: const TextStyle(
              color: Colors.black54,
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                fontWeight: FontWeight.w800,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// HISTORY PAGE
// ============================================================

class HistoryPage extends StatelessWidget {
  final List<TopUpRecord> records;

  const HistoryPage({
    super.key,
    required this.records,
  });

  String dateText(DateTime d) {
    return '${d.year}-'
        '${d.month.toString().padLeft(2, '0')}-'
        '${d.day.toString().padLeft(2, '0')} '
        '${d.hour.toString().padLeft(2, '0')}:'
        '${d.minute.toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Transaction History',
        ),
      ),
      body: records.isEmpty
          ? const Center(
              child: Column(
                mainAxisAlignment:
                    MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.receipt_long,
                    size: 60,
                    color: gold,
                  ),
                  SizedBox(height: 12),
                  Text(
                    'No transactions yet.',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ],
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: records.length,
              separatorBuilder: (_, __) =>
                  const SizedBox(height: 10),
              itemBuilder: (_, index) {
                final record = records[index];

                return Card(
                  elevation: 0,
                  color: Colors.white,
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: primaryRed,
                      child: Icon(
                        Icons.check,
                        color: Colors.white,
                      ),
                    ),
                    title: Text(
                      '${record.amount} • '
                      '${record.country}',
                      style: const TextStyle(
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    subtitle: Text(
                      '${record.phone}\n'
                      '${dateText(record.date)}\n'
                      '${record.status}',
                    ),
                    isThreeLine: true,
                    trailing: Text(
                      '€${record.fee.toStringAsFixed(2)}',
                      style: const TextStyle(
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                  ),
                );
              },
            ),
    );
  }
}    
