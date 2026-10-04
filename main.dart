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
  final String operator;
  final String phone;
  final int amount;
  final double fee;
  final double total;
  final DateTime date;
  final String status;

  TopUpRecord({
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.fee,
    required this.total,
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

  final TextEditingController phoneController =
      TextEditingController();

  int? selectedAmount;

  double? quotedPrice;
  double? quotedFee;
  double? quotedBonus;
  double? quotedTotal;

  bool loadingQuote = false;

  final List<String> countries = const [
    'Afghanistan',
    'Pakistan',
    'Bangladesh',
    'India',
  ];

  final List<String> languages = const [
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

  List<String> get operators {
    switch (country) {
      case 'Afghanistan':
        return const [
          'Auto Detect',
          'Roshan',
          'Etisalat',
          'MTN',
          'AWCC',
        ];

      case 'Pakistan':
        return const [
          'Auto Detect',
          'Jazz',
          'Zong',
          'Ufone',
          'Telenor',
        ];

      case 'Bangladesh':
        return const [
          'Auto Detect',
          'Grameenphone',
          'Robi',
          'Banglalink',
        ];

      case 'India':
        return const [
          'Auto Detect',
          'Airtel',
          'Jio',
          'Vi',
        ];

      default:
        return const ['Auto Detect'];
    }
  }

  List<int> get amounts {
    switch (country) {
      case 'Afghanistan':
        return const [100, 250, 500, 1000];

      case 'Pakistan':
        return const [100, 250, 500, 1000];

      case 'Bangladesh':
        return const [100, 250, 500, 1000];

      case 'India':
        return const [100, 250, 500, 1000];

      default:
        return const [100, 250, 500, 1000];
    }
  }

  String get currency {
    switch (country) {
      case 'Afghanistan':
        return 'AFN';

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
      case 'Afghanistan':
        return '🇦🇫';

      case 'Pakistan':
        return '🇵🇰';

      case 'Bangladesh':
        return '🇧🇩';

      case 'India':
        return '🇮🇳';

      default:
        return '🌏';
    }
  }

  bool get validPhone {
    final digits =
        phoneController.text.replaceAll(
      RegExp(r'\D'),
      '',
    );

    switch (country) {
      case 'Afghanistan':
        return digits.length >= 9 &&
            digits.length <= 10;

      case 'Pakistan':
        return digits.length >= 10 &&
            digits.length <= 11;

      case 'Bangladesh':
        return digits.length >= 10 &&
            digits.length <= 11;

      case 'India':
        return digits.length >= 10 &&
            digits.length <= 12;

      default:
        return digits.length >= 8;
    }
  }

  void clearQuote() {
    setState(() {
      quotedPrice = null;
      quotedFee = null;
      quotedBonus = null;
      quotedTotal = null;
    });
  }

  Future<void> loadQuote() async {
    if (selectedAmount == null) {
      clearQuote();
      return;
    }

    setState(() {
      loadingQuote = true;
    });

    try {
      final response = await http.post(
        Uri.parse(
          '$backendBaseUrl/api/payments/quote',
        ),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'country': country,
          'operator': operator,
          'amount': selectedAmount,
        }),
      );

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          'Quote request failed: ${response.statusCode}',
        );
      }

      final data =
          jsonDecode(response.body);

      if (data is! Map) {
        throw Exception(
          'Invalid quote response',
        );
      }

      setState(() {
        quotedPrice =
            (data['price'] as num?)?.toDouble();

        quotedFee =
            (data['fee'] as num?)?.toDouble();

        quotedBonus =
            (data['bonus'] as num?)?.toDouble();

        quotedTotal =
            (data['total'] as num?)?.toDouble();

        loadingQuote = false;
      });
    } catch (err) {
      setState(() {
        loadingQuote = false;
        quotedPrice = null;
        quotedFee = null;
        quotedBonus = null;
        quotedTotal = null;
      });

      _showMessage(
        'د قیمت معلومات ترلاسه نه شول. مهرباني وکړئ بیا هڅه وکړئ.',
      );
    }
  }

  void continueTopUp() {
    if (!validPhone) {
      _showMessage(
        'مهرباني وکړئ د موبایل صحیح شمېره دننه کړئ.',
      );
      return;
    }

    if (selectedAmount == null) {
      _showMessage(
        'مهرباني وکړئ مقدار انتخاب کړئ.',
      );
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          country: country,
          operator: operator,
          phone: phoneController.text.trim(),
          amount: selectedAmount!,
          currency: currency,
          quotedPrice: quotedPrice,
          quotedFee: quotedFee,
          quotedBonus: quotedBonus,
          quotedTotal: quotedTotal,
          onCompleted: widget.onAddHistory,
        ),
      ),
    );
  }

  void _showMessage(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
      ),
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
            padding: const EdgeInsets.fromLTRB(
              20,
              10,
              20,
              30,
            ),
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
                    fontSize: 30,
                    fontWeight: FontWeight.w900,
                    color: primaryRed,
                  ),
                ),
                const SizedBox(height: 6),
                const Text(
                  '2% بونس فعال',
                  style: TextStyle(
                    color: Colors.green,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Wallet کې پیسې وساته او 2% اضافه بونس وګټه',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(context);

                    _showMessage(
                      'Wallet top-up به په راتلونکې نسخه کې فعال شي.',
                    );
                  },
                  icon: const Icon(Icons.add),
                  label: const Text(
                    'پیسې اضافه کړئ',
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
            padding: const EdgeInsets.fromLTRB(
              20,
              10,
              20,
              30,
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(
                  Icons.card_giftcard,
                  color: primaryRed,
                  size: 48,
                ),
                const SizedBox(height: 10),
                const Text(
                  'شیر کړئ او 50 AFN بونس ترلاسه کړئ',
                  textAlign: TextAlign.center,
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 20,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                const SizedBox(height: 10),
                const Text(
                  'له ملګرو سره شریک کړئ • PGNT VIP Rewards',
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 18),
                FilledButton.icon(
                  onPressed: () {
                    Navigator.pop(context);

                    _showMessage(
                      'د Share سیستم به د Referral backend سره فعال شي.',
                    );
                  },
                  icon: const Icon(Icons.share),
                  label: const Text('شریک کړئ'),
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
          padding: const EdgeInsets.fromLTRB(
            16,
            14,
            16,
            28,
          ),
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.stretch,
            children: [
              const _VipHeader(),
              const SizedBox(height: 14),

              // WALLET
              InkWell(
                onTap: showWallet,
                borderRadius:
                    BorderRadius.circular(20),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    gradient:
                        const LinearGradient(
                      colors: [
                        primaryRed,
                        Color(0xFF9D181D),
                      ],
                    ),
                    borderRadius:
                        BorderRadius.circular(20),
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
                        backgroundColor:
                            brightGold,
                        child: Icon(
                          Icons
                              .account_balance_wallet,
                          color: primaryRed,
                          size: 28,
                        ),
                      ),
                      SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment:
                              CrossAxisAlignment.start,
                          children: [
                            Text(
                              'زما والټ',
                              style: TextStyle(
                                color:
                                    Colors.white,
                                fontSize: 16,
                                fontWeight:
                                    FontWeight.w700,
                              ),
                            ),
                            SizedBox(height: 2),
                            Text(
                              '€24.50',
                              style: TextStyle(
                                color:
                                    brightGold,
                                fontSize: 25,
                                fontWeight:
                                    FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ),
                      Column(
                        crossAxisAlignment:
                            CrossAxisAlignment.end,
                        children: [
                          Text(
                            '2% بونس فعال',
                            style: TextStyle(
                              color:
                                  brightGold,
                              fontWeight:
                                  FontWeight.w900,
                            ),
                          ),
                          SizedBox(height: 4),
                          Text(
                            'پیسې اضافه کړئ',
                            style: TextStyle(
                              color:
                                  Colors.white,
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
                    padding:
                        const EdgeInsets.all(12),
                    child: Text(
                      countryFlag,
                      style:
                          const TextStyle(
                        fontSize: 23,
                      ),
                    ),
                  ),
                  labelText: 'Country',
                ),
                items: countries
                    .map(
                      (item) =>
                          DropdownMenuItem<String>(
                        value: item,
                        child: Text(item),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }

                  setState(() {
                    country = value;
                    operator =
                        'Auto Detect';
                    selectedAmount = null;

                    quotedPrice = null;
                    quotedFee = null;
                    quotedBonus = null;
                    quotedTotal = null;
                  });
                },
              ),

              const SizedBox(height: 18),

              const _SectionTitle(
                title:
                    'موبایل شمیره دننه کړئ',
              ),

              const SizedBox(height: 8),

              TextField(
                controller:
                    phoneController,
                keyboardType:
                    TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter
                      .allow(
                    RegExp(r'[0-9+ ]'),
                  ),
                ],
                onChanged: (_) {
                  setState(() {});
                },
                decoration:
                    InputDecoration(
                  prefixIcon:
                      const Icon(
                    Icons.phone_android,
                    color: primaryRed,
                  ),
                  hintText:
                      country ==
                              'Afghanistan'
                          ? '07xxxxxxxx'
                          : 'Enter mobile number',
                  suffixIcon:
                      validPhone
                          ? const Icon(
                              Icons
                                  .check_circle,
                              color:
                                  Colors.green,
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
                value:
                    operators.contains(
                  operator,
                )
                        ? operator
                        : 'Auto Detect',
                decoration:
                    const InputDecoration(
                  prefixIcon:
                      Icon(
                    Icons.sim_card,
                    color: primaryRed,
                  ),
                  labelText:
                      'Operator',
                ),
                items: operators
                    .map(
                      (item) =>
                          DropdownMenuItem<
                              String>(
                        value: item,
                        child:
                            Text(item),
                      ),
                    )
                    .toList(),
                onChanged: (value) {
                  if (value == null) {
                    return;
                  }

                  setState(() {
                    operator = value;
                    quotedPrice = null;
                    quotedFee = null;
                    quotedBonus = null;
                    quotedTotal = null;
                  });
                },
              ),

              const SizedBox(height: 18),

              const _SectionTitle(
                title:
                    'مقدار انتخاب کړئ',
              ),

              const SizedBox(height: 8),

              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: amounts.map(
                  (amount) {
                    final selected =
                        selectedAmount ==
                            amount;

                    return ChoiceChip(
                      selected: selected,
                      label: Text(
                        '$amount $currency',
                        style: TextStyle(
                          fontWeight:
                              FontWeight.w800,
                          color: selected
                              ? Colors.white
                              : primaryRed,
                        ),
                      ),
                      selectedColor:
                          primaryRed,
                      backgroundColor:
                          Colors.white,
                      side:
                          const BorderSide(
                        color: gold,
                      ),
                      onSelected:
                          (value) async {
                        if (!value) {
                          return;
                        }

                        setState(() {
                          selectedAmount =
                              amount;
                          quotedPrice =
                              null;
                          quotedFee =
                              null;
                          quotedBonus =
                              null;
                          quotedTotal =
                              null;
                        });

                        await loadQuote();
                      },
                    );
                  },
                ).toList(),
              ),

              const SizedBox(height: 20),

              if (loadingQuote)
                const Center(
                  child:
                      CircularProgressIndicator(
                    color: primaryRed,
                  ),
                ),

              if (!loadingQuote &&
                  selectedAmount != null &&
                  quotedPrice != null)
                Container(
                  padding:
                      const EdgeInsets.all(16),
                  decoration:
                      BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.circular(
                      18,
                    ),
                    border:
                        Border.all(
                      color: gold,
                    ),
                  ),
                  child: Column(
                    children: [
                      _PriceRow(
                        title:
                            'Product Price',
                        value:
                            '€${quotedPrice!.toStringAsFixed(2)}',
                      ),
                      const SizedBox(
                        height: 8,
                      ),
                      _PriceRow(
                        title:
                            'Fee',
                        value:
                            '€${(quotedFee ?? 0).toStringAsFixed(2)}',
                      ),
                      const SizedBox(
                        height: 8,
                      ),
                      _PriceRow(
                        title:
                            'Bonus',
                        value:
                            '${(quotedBonus ?? 0).toStringAsFixed(2)}',
                      ),
                      const Divider(
                        height: 22,
                      ),
                      _PriceRow(
                        title:
                            'Total',
                        value:
                            '€${(quotedTotal ?? 0).toStringAsFixed(2)}',
                        bold: true,
                      ),
                    ],
                  ),
                ),

              const SizedBox(height: 22),

              // REFERRAL
              OutlinedButton.icon(
                onPressed: showReferral,
                icon: const Icon(
                  Icons.card_giftcard,
                ),
                label: const Text(
                  'شریک کړئ او 50 AFN بونس ترلاسه کړئ',
                ),
                style:
                    OutlinedButton.styleFrom(
                  foregroundColor:
                      primaryRed,
                  side:
                      const BorderSide(
                    color: gold,
                  ),
                  padding:
                      const EdgeInsets.symmetric(
                    vertical: 14,
                  ),
                ),
              ),

              const SizedBox(height: 12),

              // CONTINUE
              FilledButton.icon(
                onPressed:
                    loadingQuote
                        ? null
                        : continueTopUp,
                icon: const Icon(
                  Icons.arrow_forward,
                ),
                label: const Text(
                  'ادامه ورکړئ',
                  style: TextStyle(
                    fontSize: 17,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
                style:
                    FilledButton.styleFrom(
                  backgroundColor:
                      primaryRed,
                  foregroundColor:
                      Colors.white,
                  padding:
                      const EdgeInsets.symmetric(
                    vertical: 16,
                  ),
                  shape:
                      RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(
                      15,
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
      padding:
          const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: beige,
        borderRadius:
            BorderRadius.circular(20),
        border:
            Border.all(color: gold),
      ),
      child: const Row(
        children: [
          CircleAvatar(
            radius: 28,
            backgroundColor:
                primaryRed,
            child: Icon(
              Icons.bolt,
              color: brightGold,
              size: 30,
            ),
          ),
          SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment.start,
              children: [
                Text(
                  'PGNT ASIAN TOP UP',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 20,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  'Fast • Secure • VIP',
                  style: TextStyle(
                    fontWeight:
                        FontWeight.w700,
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
// SECTION TITLE
// ============================================================

class _SectionTitle
    extends StatelessWidget {
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
        fontSize: 17,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

// ============================================================
// PRICE ROW
// ============================================================

class _PriceRow
    extends StatelessWidget {
  final String title;
  final String value;
  final bool bold;

  const _PriceRow({
    required this.title,
    required this.value,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    final style = TextStyle(
      fontSize: bold ? 18 : 15,
      fontWeight:
          bold ? FontWeight.w900 : FontWeight.w600,
      color:
          bold ? primaryRed : Colors.black87,
    );

    return Row(
      mainAxisAlignment:
          MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: style,
        ),
        Text(
          value,
          style: style,
        ),
      ],
    );
  }
}
// ============================================================
// CHECKOUT PAGE
// ============================================================

class CheckoutPage extends StatefulWidget {
  final String country;
  final String operator;
  final String phone;
  final int amount;
  final String currency;

  final double? quotedPrice;
  final double? quotedFee;
  final double? quotedBonus;
  final double? quotedTotal;

  final ValueChanged<TopUpRecord> onCompleted;

  const CheckoutPage({
    super.key,
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.quotedPrice,
    required this.quotedFee,
    required this.quotedBonus,
    required this.quotedTotal,
    required this.onCompleted,
  });

  @override
  State<CheckoutPage> createState() =>
      _CheckoutPageState();
}

class _CheckoutPageState
    extends State<CheckoutPage> {
  bool loading = false;

  String? errorMessage;

  Future<void> startStripeCheckout() async {
    if (loading) return;

    setState(() {
      loading = true;
      errorMessage = null;
    });

    try {
      /*
       * IMPORTANT:
       * The backend is responsible for the
       * final price, fee and bonus.
       *
       * Flutter does NOT send a trusted price.
       */

      final response = await http.post(
        Uri.parse(
          '$backendBaseUrl/api/payments/checkout',
        ),
        headers: {
          'Content-Type':
              'application/json',
        },
        body: jsonEncode({
          'country': widget.country,
          'operator': widget.operator,
          'phone': widget.phone,
          'amount': widget.amount,
          'currency': widget.currency,
        }),
      );

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        String message =
            'Checkout جوړ نه شو.';

        try {
          final body =
              jsonDecode(response.body);

          if (body is Map &&
              body['error'] != null) {
            message =
                body['error'].toString();
          }
        } catch (_) {}

        throw Exception(message);
      }

      final data =
          jsonDecode(response.body);

      if (data is! Map) {
        throw Exception(
          'د سرور ناسم ځواب.',
        );
      }

      /*
       * Backend should return:
       *
       * {
       *   "url": "https://checkout.stripe.com/..."
       * }
       */

      final checkoutUrl =
          data['url']?.toString();

      if (checkoutUrl == null ||
          checkoutUrl.isEmpty) {
        throw Exception(
          'Stripe Checkout URL ترلاسه نه شو.',
        );
      }

      final uri =
          Uri.tryParse(checkoutUrl);

      if (uri == null) {
        throw Exception(
          'Stripe URL ناسم دی.',
        );
      }

      final opened =
          await launchUrl(
        uri,
        mode:
            LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception(
          'Stripe Checkout پرانیستل نشو.',
        );
      }

      /*
       * We do NOT mark the order as
       * completed here.
       *
       * Stripe webhook on the backend
       * confirms the actual payment.
       */

      if (mounted) {
        _showInfo(
          'Stripe Payment پاڼه پرانیستل شوه. د تادیې له بشپړېدو وروسته به سیستم ستاسې امر تایید کړي.',
        );
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          errorMessage =
              err.toString().replaceFirst(
                    'Exception: ',
                    '',
                  );
        });
      }
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  void _showInfo(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(
        content: Text(message),
        duration:
            const Duration(seconds: 5),
      ),
    );
  }

  double get displayPrice =>
      widget.quotedPrice ?? 0;

  double get displayFee =>
      widget.quotedFee ?? 0;

  double get displayBonus =>
      widget.quotedBonus ?? 0;

  double get displayTotal =>
      widget.quotedTotal ??
      (displayPrice + displayFee);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Checkout',
          style: TextStyle(
            fontWeight:
                FontWeight.w900,
          ),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding:
              const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.stretch,
            children: [
              const Icon(
                Icons.lock_outline,
                size: 52,
                color: primaryRed,
              ),

              const SizedBox(height: 10),

              const Text(
                'خوندي Payment',
                textAlign:
                    TextAlign.center,
                style: TextStyle(
                  color: primaryRed,
                  fontSize: 24,
                  fontWeight:
                      FontWeight.w900,
                ),
              ),

              const SizedBox(height: 20),

              Container(
                padding:
                    const EdgeInsets.all(18),
                decoration:
                    BoxDecoration(
                  color: Colors.white,
                  borderRadius:
                      BorderRadius.circular(
                    18,
                  ),
                  border:
                      Border.all(
                    color: gold,
                  ),
                ),
                child: Column(
                  children: [
                    _CheckoutRow(
                      title: 'هیواد',
                      value:
                          widget.country,
                    ),

                    const SizedBox(
                      height: 10,
                    ),

                    _CheckoutRow(
                      title: 'Operator',
                      value:
                          widget.operator,
                    ),

                    const SizedBox(
                      height: 10,
                    ),

                    _CheckoutRow(
                      title: 'شمېره',
                      value:
                          widget.phone,
                    ),

                    const SizedBox(
                      height: 10,
                    ),

                    _CheckoutRow(
                      title: 'Amount',
                      value:
                          '${widget.amount} ${widget.currency}',
                    ),

                    const Divider(
                      height: 26,
                    ),

                    _CheckoutRow(
                      title:
                          'Product Price',
                      value:
                          '€${displayPrice.toStringAsFixed(2)}',
                    ),

                    const SizedBox(
                      height: 10,
                    ),

                    _CheckoutRow(
                      title: 'Fee',
                      value:
                          '€${displayFee.toStringAsFixed(2)}',
                    ),

                    const SizedBox(
                      height: 10,
                    ),

                    _CheckoutRow(
                      title: 'Bonus',
                      value:
                          displayBonus
                              .toStringAsFixed(2),
                      valueColor:
                          Colors.green,
                    ),

                    const Divider(
                      height: 26,
                    ),

                    _CheckoutRow(
                      title: 'Total',
                      value:
                          '€${displayTotal.toStringAsFixed(2)}',
                      bold: true,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              if (errorMessage != null)
                Container(
                  padding:
                      const EdgeInsets.all(
                    14,
                  ),
                  decoration:
                      BoxDecoration(
                    color:
                        const Color(
                      0xFFFFE5E5,
                    ),
                    borderRadius:
                        BorderRadius.circular(
                      14,
                    ),
                    border:
                        Border.all(
                      color: Colors.red,
                    ),
                  ),
                  child: Text(
                    errorMessage!,
                    style:
                        const TextStyle(
                      color: Colors.red,
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),
                ),

              if (errorMessage != null)
                const SizedBox(
                  height: 14,
                ),

              FilledButton.icon(
                onPressed:
                    loading
                        ? null
                        : startStripeCheckout,
                icon: loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child:
                            CircularProgressIndicator(
                          strokeWidth: 2,
                          color:
                              Colors.white,
                        ),
                      )
                    : const Icon(
                        Icons
                            .credit_card,
                      ),
                label: Text(
                  loading
                      ? 'لږ انتظار...'
                      : 'د Stripe له لارې تادیه',
                  style:
                      const TextStyle(
                    fontSize: 17,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
                style:
                    FilledButton.styleFrom(
                  backgroundColor:
                      primaryRed,
                  foregroundColor:
                      Colors.white,
                  padding:
                      const EdgeInsets.symmetric(
                    vertical: 16,
                  ),
                  shape:
                      RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(
                      15,
                    ),
                  ),
                ),
              ),

              const SizedBox(height: 12),

              const Text(
                'ستاسې کارت معلومات PGNT ASIAN ته نه ساتل کېږي؛ تادیه د Stripe خوندي پاڼې له لارې ترسره کېږي.',
                textAlign:
                    TextAlign.center,
                style: TextStyle(
                  color: Colors.black54,
                  fontSize: 12,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ============================================================
// CHECKOUT ROW
// ============================================================

class _CheckoutRow
    extends StatelessWidget {
  final String title;
  final String value;
  final bool bold;
  final Color? valueColor;

  const _CheckoutRow({
    required this.title,
    required this.value,
    this.bold = false,
    this.valueColor,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment:
          CrossAxisAlignment.start,
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontWeight:
                  bold
                      ? FontWeight.w900
                      : FontWeight.w600,
            ),
          ),
        ),
        const SizedBox(width: 12),
        Flexible(
          child: Text(
            value,
            textAlign:
                TextAlign.end,
            style: TextStyle(
              color:
                  valueColor ??
                      (bold
                          ? primaryRed
                          : Colors.black87),
              fontWeight:
                  bold
                      ? FontWeight.w900
                      : FontWeight.w700,
              fontSize:
                  bold ? 18 : 14,
            ),
          ),
        ),
      ],
    );
  }
}

// ============================================================
// HISTORY PAGE
// ============================================================

class HistoryPage
    extends StatelessWidget {
  final List<TopUpRecord> records;

  const HistoryPage({
    super.key,
    required this.records,
  });

  String formatDate(DateTime date) {
    final day =
        date.day.toString().padLeft(
              2,
              '0',
            );

    final month =
        date.month.toString().padLeft(
              2,
              '0',
            );

    final year =
        date.year.toString();

    final hour =
        date.hour.toString().padLeft(
              2,
              '0',
            );

    final minute =
        date.minute.toString().padLeft(
              2,
              '0',
            );

    return '$day/$month/$year $hour:$minute';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Transaction History',
          style: TextStyle(
            fontWeight:
                FontWeight.w900,
          ),
        ),
      ),
      body: records.isEmpty
          ? const Center(
              child: Column(
                mainAxisSize:
                    MainAxisSize.min,
                children: [
                  Icon(
                    Icons.history,
                    size: 60,
                    color: gold,
                  ),
                  SizedBox(height: 12),
                  Text(
                    'تر اوسه کومه معامله نشته.',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),
                ],
              ),
            )
          : ListView.builder(
              padding:
                  const EdgeInsets.all(
                16,
              ),
              itemCount:
                  records.length,
              itemBuilder:
                  (context, index) {
                final record =
                    records[index];

                return Card(
                  margin:
                      const EdgeInsets.only(
                    bottom: 12,
                  ),
                  elevation: 0,
                  shape:
                      RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(
                      16,
                    ),
                    side:
                        const BorderSide(
                      color: gold,
                    ),
                  ),
                  child: Padding(
                    padding:
                        const EdgeInsets.all(
                      16,
                    ),
                    child: Column(
                      children: [
                        Row(
                          children: [
                            const CircleAvatar(
                              backgroundColor:
                                  primaryRed,
                              child: Icon(
                                Icons
                                    .phone_android,
                                color:
                                    Colors.white,
                              ),
                            ),
                            const SizedBox(
                              width: 12,
                            ),
                            Expanded(
                              child:
                                  Column(
                                crossAxisAlignment:
                                    CrossAxisAlignment
                                        .start,
                                children: [
                                  Text(
                                    record
                                        .country,
                                    style:
                                        const TextStyle(
                                      fontWeight:
                                          FontWeight.w900,
                                    ),
                                  ),
                                  Text(
                                    record
                                        .phone,
                                    style:
                                        const TextStyle(
                                      color:
                                          Colors.black54,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Text(
                              '${record.amount}',
                              style:
                                  const TextStyle(
                                color:
                                    primaryRed,
                                fontWeight:
                                    FontWeight.w900,
                              ),
                            ),
                          ],
                        ),

                        const Divider(
                          height: 22,
                        ),

                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment
                                  .spaceBetween,
                          children: [
                            Text(
                              record
                                  .operator,
                            ),
                            Text(
                              record.status,
                              style:
                                  TextStyle(
                                color:
                                    record.status.toLowerCase() ==
                                            'completed'
                                        ? Colors
                                            .green
                                        : primaryRed,
                                fontWeight:
                                    FontWeight.w800,
                              ),
                            ),
                          ],
                        ),

                        const SizedBox(
                          height: 8,
                        ),

                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment
                                  .spaceBetween,
                          children: [
                            Text(
                              formatDate(
                                record
                                    .date,
                              ),
                              style:
                                  const TextStyle(
                                fontSize:
                                    12,
                                color:
                                    Colors.black54,
                              ),
                            ),
                            Text(
                              '€${record.total.toStringAsFixed(2)}',
                              style:
                                  const TextStyle(
                                fontWeight:
                                    FontWeight.w900,
                              ),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
    );
  }
}
// ============================================================
// END OF MAIN.DART
// ============================================================
//
// PGNT ASIAN TOP UP
//
// مهم:
// - Stripe Secret Key په Flutter کې مه اچوئ.
// - DT One API Key/Secret په Flutter کې مه اچوئ.
// - قیمت، Fee او Bonus باید د Backend له Database څخه راشي.
// - د Payment وروستی تایید باید د Stripe Webhook له لارې وشي.
// - Flutter باید یوازې Checkout URL پرانیزي.
//
// ============================================================

// دا برخه د main.dart پای دی.
//
// که د درېیمې برخې په پای کې لاندې کرښه موجوده وي:
//
// }
//
// نو نور کوډ مه ورزیاتوئ.
//
// ============================================================
