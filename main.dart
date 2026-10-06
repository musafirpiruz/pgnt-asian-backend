import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PgntAsianApp());
}

// ============================================================
// PGNT ASIAN TOPUP
// ============================================================

const primaryRed = Color(0xFF7A0C10);
const darkRed = Color(0xFF4B0508);
const gold = Color(0xFFD4B896);
const brightGold = Color(0xFFFFD700);
const cream = Color(0xFFFFF8E7);
const green = Color(0xFF18A957);
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
  final String currency;
  final String status;
  final String orderId;
  final DateTime date;

  const TopUpRecord({
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.fee,
    required this.total,
    required this.currency,
    required this.status,
    required this.orderId,
    required this.date,
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
      title: 'PGNT ASIAN TOPUP',

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

          contentPadding:
              const EdgeInsets.symmetric(
            horizontal: 16,
            vertical: 16,
          ),

          border: OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(15),
            borderSide:
                const BorderSide(
              color: gold,
            ),
          ),

          enabledBorder:
              OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(15),
            borderSide:
                const BorderSide(
              color: gold,
            ),
          ),

          focusedBorder:
              OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(15),
            borderSide:
                const BorderSide(
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
          setState(() {
            language = value;
          });
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

  final ValueChanged<String>
      onLanguageChanged;

  final ValueChanged<TopUpRecord>
      onAddHistory;

  const HomePage({
    super.key,
    required this.language,
    required this.history,
    required this.onLanguageChanged,
    required this.onAddHistory,
  });

  @override
  State<HomePage> createState() =>
      _HomePageState();
}

class _HomePageState
    extends State<HomePage> {
  String country = 'Afghanistan';

  String operator = 'Auto Detect';

  int? selectedAmount;

  final phoneController =
      TextEditingController();

  // ----------------------------------------------------------
  // COUNTRIES
  // ----------------------------------------------------------

  final countries = const [
    'Afghanistan',
    'Pakistan',
    'Bangladesh',
    'India',
  ];

  // ----------------------------------------------------------
  // LANGUAGES
  // ----------------------------------------------------------

  final languages = const [
    'English',
    'پښتو',
    'دری',
    'اردو',
    'हिन्दी',
    'বাংলা',
  ];

  // ----------------------------------------------------------
  // AMOUNTS
  // ----------------------------------------------------------

  final amounts = const [
    100,
    250,
    500,
    1000,
  ];

  // ----------------------------------------------------------
  // OPERATORS
  // ----------------------------------------------------------

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
        return const [
          'Auto Detect',
        ];
    }
  }

  // ----------------------------------------------------------
  // CURRENCY
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // FLAG
  // ----------------------------------------------------------

  String get flag {
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

  // ----------------------------------------------------------
  // PHONE VALIDATION
  // ----------------------------------------------------------

  bool get validPhone {
    final digits =
        phoneController.text
            .replaceAll(
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
        return false;
    }
  }

  // ----------------------------------------------------------
  // DISPOSE
  // ----------------------------------------------------------

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  // ----------------------------------------------------------
  // MESSAGE
  // ----------------------------------------------------------

  void showMessage(String message) {
    ScaffoldMessenger.of(context)
        .showSnackBar(
      SnackBar(
        content: Text(message),
      ),
    );
  }

  // ----------------------------------------------------------
  // COUNTRY CHANGE
  // ----------------------------------------------------------

  void changeCountry(String value) {
    setState(() {
      country = value;

      operator = operators.first;

      selectedAmount = null;

      phoneController.clear();
    });
  }

  // ----------------------------------------------------------
  // CONTINUE
  // ----------------------------------------------------------

  void continueTopUp() {
    if (!validPhone) {
      showMessage(
        'مهرباني وکړئ صحیح موبایل شمېره ولیکئ.',
      );
      return;
    }

    if (selectedAmount == null) {
      showMessage(
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
          phone:
              phoneController.text.trim(),
          amount: selectedAmount!,
          currency: currency,
          onCompleted:
              widget.onAddHistory,
        ),
      ),
    );
  }

  // ----------------------------------------------------------
  // HISTORY
  // ----------------------------------------------------------

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

  // ----------------------------------------------------------
  // REFERRAL
  // ----------------------------------------------------------

  void showReferral() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) {
        return Padding(
          padding:
              const EdgeInsets.fromLTRB(
            20,
            10,
            20,
            30,
          ),
          child: Column(
            mainAxisSize:
                MainAxisSize.min,
            crossAxisAlignment:
                CrossAxisAlignment.stretch,
            children: [
              const Text(
                'شیر کړئ او 50 AFN بونس ترلاسه کړئ',
                textAlign:
                    TextAlign.center,
                style: TextStyle(
                  fontSize: 21,
                  fontWeight:
                      FontWeight.w900,
                  color: primaryRed,
                ),
              ),

              const SizedBox(
                height: 10,
              ),

              const Text(
                'له ملګرو سره PGNT ASIAN TOPUP شریک کړئ.',
                textAlign:
                    TextAlign.center,
              ),

              const SizedBox(
                height: 18,
              ),

              FilledButton.icon(
                onPressed: () {
                  Navigator.pop(
                    context,
                  );

                  showMessage(
                    'Share feature به د Production سیستم سره وصل شي.',
                  );
                },
                icon: const Icon(
                  Icons.share,
                ),
                label: const Text(
                  'له ملګرو سره شریک کړئ',
                ),
              ),
            ],
          ),
        );
      },
    );
  }

  // ----------------------------------------------------------
  // BUILD
  // ----------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'PGNT ASIAN TOPUP',
          style: TextStyle(
            fontWeight:
                FontWeight.w900,
          ),
        ),

        actions: [
          PopupMenuButton<String>(
            icon: const Icon(
              Icons.language,
            ),
            onSelected:
                widget.onLanguageChanged,
            itemBuilder: (_) {
              return languages
                  .map(
                    (language) =>
                        PopupMenuItem(
                      value: language,
                      child:
                          Text(language),
                    ),
                  )
                  .toList();
            },
          ),

          IconButton(
            onPressed: showHistory,
            icon: const Icon(
              Icons.history,
            ),
          ),
        ],
      ),

      body: SafeArea(
        child: SingleChildScrollView(
          padding:
              const EdgeInsets.fromLTRB(
            16,
            14,
            16,
            28,
          ),
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment
                    .stretch,
            children: [
              _HeaderCard(
                onReferral:
                    showReferral,
              ),

              const SizedBox(
                height: 16,
              ),

              _WalletCard(
                onTap: () {
                  showMessage(
                    'Wallet system به Backend سره وصل کېږي.',
                  );
                },
              ),

              const SizedBox(
                height: 20,
              ),

              const _SectionTitle(
                title:
                    'هیواد انتخاب کړئ',
              ),

              const SizedBox(
                height: 8,
              ),

              DropdownButtonFormField<
                  String>(
                value: country,

                decoration:
                    InputDecoration(
                  prefixIcon:
                      Padding(
                    padding:
                        const EdgeInsets
                            .all(12),
                    child: Text(
                      flag,
                      style:
                          const TextStyle(
                        fontSize: 22,
                      ),
                    ),
                  ),
                  labelText:
                      'Country',
                ),

                items: countries
                    .map(
                      (value) =>
                          DropdownMenuItem(
                        value: value,
                        child:
                            Text(value),
                      ),
                    )
                    .toList(),

                onChanged: (value) {
                  if (value ==
                      null) {
                    return;
                  }

                  changeCountry(
                    value,
                  );
                },
              ),

              const SizedBox(
                height: 18,
              ),

              const _SectionTitle(
                title:
                    'موبایل شمېره دننه کړئ',
              ),

              const SizedBox(
                height: 8,
              ),

              TextField(
                controller:
                    phoneController,

                keyboardType:
                    TextInputType.phone,

                inputFormatters: [
                  FilteringTextInputFormatter
                      .allow(
                    RegExp(
                      r'[0-9+ ]',
                    ),
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
                    color:
                        primaryRed,
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
                                  green,
                            )
                          : null,
                ),
              ),

              const SizedBox(
                height: 18,
              ),

              const _SectionTitle(
                title: 'Operator',
              ),

              const SizedBox(
                height: 8,
              ),

              DropdownButtonFormField<
                  String>(
                value:
                    operators.contains(
                  operator,
                )
                        ? operator
                        : operators
                            .first,

                decoration:
                    const InputDecoration(
                  prefixIcon:
                      Icon(
                    Icons.sim_card,
                    color:
                        primaryRed,
                  ),
                ),

                items: operators
                    .map(
                      (value) =>
                          DropdownMenuItem(
                        value: value,
                        child:
                            Text(value),
                      ),
                    )
                    .toList(),

                onChanged: (value) {
                  if (value !=
                      null) {
                    setState(() {
                      operator =
                          value;
                    });
                  }
                },
              ),

              const SizedBox(
                height: 18,
              ),

              const _SectionTitle(
                title:
                    'مقدار انتخاب کړئ',
              ),

              const SizedBox(
                height: 8,
              ),

              Wrap(
                spacing: 10,
                runSpacing: 10,

                children:
                    amounts.map(
                  (amount) {
                    final selected =
                        selectedAmount ==
                            amount;

                    return _AmountButton(
                      amount: amount,
                      currency:
                          currency,
                      selected:
                          selected,
                      onTap: () {
                        setState(() {
                          selectedAmount =
                              amount;
                        });
                      },
                    );
                  },
                ).toList(),
              ),

              const SizedBox(
                height: 20,
              ),

              _FeeCard(
                amount:
                    selectedAmount,
                currency:
                    currency,
              ),

              const SizedBox(
                height: 20,
              ),

              FilledButton.icon(
                onPressed:
                    continueTopUp,

                icon: const Icon(
                  Icons.arrow_forward,
                ),

                label: const Text(
                  'Continue →',
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
                  minimumSize:
                      const Size
                          .fromHeight(
                    56,
                  ),
                  shape:
                      RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius
                            .circular(
                      15,
                    ),
                  ),
                ),
              ),

              const SizedBox(
                height: 14,
              ),

              OutlinedButton.icon(
                onPressed:
                    showHistory,

                icon: const Icon(
                  Icons.receipt_long,
                ),

                label: const Text(
                  'View Top-up History',
                ),
              ),

              const SizedBox(
                height: 24,
              ),

              const Center(
                child: Text(
                  'Fast • Secure • Reliable',
                  style: TextStyle(
                    color:
                        primaryRed,
                    fontWeight:
                        FontWeight.w900,
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
// HEADER CARD
// ============================================================

class _HeaderCard extends StatelessWidget {
  final VoidCallback onReferral;

  const _HeaderCard({
    required this.onReferral,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [
            darkRed,
            primaryRed,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius:
            BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            color: Color(0x30000000),
            blurRadius: 14,
            offset: Offset(0, 7),
          ),
        ],
      ),
      child: Column(
        children: [
          const Icon(
            Icons.public,
            color: brightGold,
            size: 48,
          ),

          const SizedBox(height: 6),

          const Text(
            'PGNT ASIAN TOPUP',
            textAlign: TextAlign.center,
            style: TextStyle(
              color: brightGold,
              fontSize: 26,
              fontWeight: FontWeight.w900,
              letterSpacing: .3,
            ),
          ),

          const SizedBox(height: 5),

          const Text(
            'Fast • Secure • Reliable',
            style: TextStyle(
              color: Colors.white,
              fontSize: 14,
              fontWeight: FontWeight.w700,
            ),
          ),

          const SizedBox(height: 14),

          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: onReferral,
              icon: const Icon(
                Icons.card_giftcard,
                color: brightGold,
              ),
              label: const Text(
                'Share & Get 50 AFN Bonus',
                style: TextStyle(
                  color: Colors.white,
                  fontWeight: FontWeight.w900,
                ),
              ),
              style: OutlinedButton.styleFrom(
                side: const BorderSide(
                  color: brightGold,
                ),
                shape: RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.circular(13),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ============================================================
// WALLET CARD
// ============================================================

class _WalletCard extends StatelessWidget {
  final VoidCallback onTap;

  const _WalletCard({
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius:
          BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [
              primaryRed,
              Color(0xFF9D181D),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius:
              BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            Container(
              width: 54,
              height: 54,
              decoration: const BoxDecoration(
                color: brightGold,
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons.account_balance_wallet,
                color: primaryRed,
                size: 28,
              ),
            ),

            const SizedBox(width: 14),

            const Expanded(
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Text(
                    'Wallet Balance',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),

                  SizedBox(height: 3),

                  Text(
                    '€24.50',
                    style: TextStyle(
                      color: brightGold,
                      fontSize: 25,
                      fontWeight:
                          FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),

            const Column(
              crossAxisAlignment:
                  CrossAxisAlignment.end,
              children: [
                Text(
                  '2% Bonus Active 🎁',
                  style: TextStyle(
                    color: brightGold,
                    fontSize: 12,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),

                SizedBox(height: 5),

                Text(
                  '+ Add Money',
                  style: TextStyle(
                    color: Colors.white,
                    fontSize: 12,
                    fontWeight:
                        FontWeight.w700,
                  ),
                ),
              ],
            ),
          ],
        ),
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
        fontSize: 18,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}

// ============================================================
// AMOUNT BUTTON
// ============================================================

class _AmountButton extends StatelessWidget {
  final int amount;
  final String currency;
  final bool selected;
  final VoidCallback onTap;

  const _AmountButton({
    required this.amount,
    required this.currency,
    required this.selected,
    required this.onTap,
  });

  int get bonus {
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

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration:
            const Duration(milliseconds: 180),

        width: 150,

        padding:
            const EdgeInsets.symmetric(
          horizontal: 12,
          vertical: 14,
        ),

        decoration: BoxDecoration(
          color: selected
              ? primaryRed
              : Colors.white,

          borderRadius:
              BorderRadius.circular(15),

          border: Border.all(
            color: selected
                ? primaryRed
                : gold,
            width: selected ? 2 : 1,
          ),

          boxShadow: selected
              ? const [
                  BoxShadow(
                    color: Color(0x25000000),
                    blurRadius: 8,
                    offset: Offset(0, 4),
                  ),
                ]
              : null,
        ),

        child: Column(
          children: [
            Text(
              '$amount $currency',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: selected
                    ? Colors.white
                    : primaryRed,
                fontSize: 16,
                fontWeight:
                    FontWeight.w900,
              ),
            ),

            if (bonus > 0) ...[
              const SizedBox(height: 4),

              Text(
                '+ $bonus Bonus',
                style: TextStyle(
                  color: selected
                      ? brightGold
                      : green,
                  fontSize: 12,
                  fontWeight:
                      FontWeight.w800,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

// ============================================================
// FEE / PRICE CARD
// ============================================================

class _FeeCard extends StatelessWidget {
  final int? amount;
  final String currency;

  const _FeeCard({
    required this.amount,
    required this.currency,
  });

  String _displayAmount() {
    if (amount == null) {
      return '—';
    }

    switch (amount) {
      case 100:
        return '€1.64';

      case 250:
        return '€3.89';

      case 500:
        return '€7.49';

      case 1000:
        return '€14.29';

      default:
        return '—';
    }
  }

  String _displayBonus() {
    switch (amount) {
      case 100:
        return '+10';

      case 250:
        return '+35';

      case 500:
        return '+80';

      default:
        return '0';
    }
  }

  @override
  Widget build(BuildContext context) {
    if (amount == null) {
      return Container(
        padding:
            const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius:
              BorderRadius.circular(17),
          border: Border.all(
            color: gold,
          ),
        ),
        child: const Row(
          children: [
            Icon(
              Icons.receipt_long,
              color: primaryRed,
            ),
            SizedBox(width: 10),
            Expanded(
              child: Text(
                'مقدار انتخاب کړئ تر څو قیمت او بونس ښکاره شي.',
                style: TextStyle(
                  fontWeight:
                      FontWeight.w700,
                ),
              ),
            ),
          ],
        ),
      );
    }

    final price =
        _displayAmount();

    return Container(
      padding:
          const EdgeInsets.all(16),

      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius:
            BorderRadius.circular(18),
        border: Border.all(
          color: gold,
        ),
      ),

      child: Column(
        children: [
          Row(
            children: [
              const Icon(
                Icons.receipt_long,
                color: primaryRed,
              ),

              const SizedBox(width: 10),

              const Expanded(
                child: Text(
                  'Order Summary',
                  style: TextStyle(
                    color: primaryRed,
                    fontSize: 17,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),

          const SizedBox(height: 14),

          _PriceRow(
            title: 'Amount',
            value:
                '$amount $currency',
          ),

          const SizedBox(height: 7),

          _PriceRow(
            title: 'Product Price',
            value: price,
          ),

          const SizedBox(height: 7),

          const _PriceRow(
            title: 'Service Fee',
            value: 'Calculated at checkout',
          ),

          const SizedBox(height: 7),

          _PriceRow(
            title: 'Bonus',
            value:
                '${_displayBonus()} $currency',
            valueColor: green,
          ),

          const Divider(
            height: 22,
          ),

          const _PriceRow(
            title: 'Final Price',
            value: 'Calculated by server',
            bold: true,
          ),
        ],
      ),
    );
  }
}

// ============================================================
// PRICE ROW
// ============================================================

class _PriceRow extends StatelessWidget {
  final String title;
  final String value;
  final Color? valueColor;
  final bool bold;

  const _PriceRow({
    required this.title,
    required this.value,
    this.valueColor,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              color: Colors.black87,
              fontWeight: bold
                  ? FontWeight.w900
                  : FontWeight.w600,
            ),
          ),
        ),

        Text(
          value,
          textAlign: TextAlign.end,
          style: TextStyle(
            color:
                valueColor ?? primaryRed,
            fontWeight: bold
                ? FontWeight.w900
                : FontWeight.w700,
          ),
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

  final ValueChanged<TopUpRecord>
      onCompleted;

  const CheckoutPage({
    super.key,
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.onCompleted,
  });

  @override
  State<CheckoutPage> createState() =>
      _CheckoutPageState();
}

// ============================================================
// CHECKOUT STATE
// ============================================================

class _CheckoutPageState
    extends State<CheckoutPage> {
  bool loading = false;

  String? errorMessage;

  // ----------------------------------------------------------
  // CREATE CHECKOUT SESSION
  // ----------------------------------------------------------

  Future<void> startCheckout() async {
    if (loading) {
      return;
    }

    setState(() {
      loading = true;
      errorMessage = null;
    });

    try {
      final uri = Uri.parse(
        '$backendBaseUrl/api/payments/checkout',
      );

      final response = await http.post(
        uri,
        headers: const {
          'Content-Type':
              'application/json',
          'Accept':
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

      Map<String, dynamic> data = {};

      try {
        final decoded =
            jsonDecode(response.body);

        if (decoded
            is Map<String, dynamic>) {
          data = decoded;
        }
      } catch (_) {
        // Server returned non-JSON.
      }

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Checkout failed (${response.statusCode})',
        );
      }

      final checkoutUrl =
          data['url']?.toString() ??
              data['checkoutUrl']
                  ?.toString();

      if (checkoutUrl == null ||
          checkoutUrl.isEmpty) {
        throw Exception(
          'Checkout URL was not returned by server.',
        );
      }

      final checkoutUri =
          Uri.tryParse(checkoutUrl);

      if (checkoutUri == null) {
        throw Exception(
          'Invalid checkout URL.',
        );
      }

      final opened =
          await launchUrl(
        checkoutUri,
        mode:
            LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception(
          'Could not open Stripe Checkout.',
        );
      }
    } catch (error) {
      if (!mounted) {
        return;
      }

      setState(() {
        errorMessage =
            error.toString().replaceFirst(
                  'Exception: ',
                  '',
                );
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content: Text(
            errorMessage!,
          ),
        ),
      );
    } finally {
      if (mounted) {
        setState(() {
          loading = false;
        });
      }
    }
  }

  // ----------------------------------------------------------
  // ORDER SUMMARY
  // ----------------------------------------------------------

  Widget summaryRow(
    String title,
    String value, {
    bool bold = false,
  }) {
    return Padding(
      padding:
          const EdgeInsets.symmetric(
        vertical: 7,
      ),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontWeight: bold
                    ? FontWeight.w900
                    : FontWeight.w600,
              ),
            ),
          ),
          Text(
            value,
            textAlign: TextAlign.end,
            style: TextStyle(
              color: primaryRed,
              fontWeight: bold
                  ? FontWeight.w900
                  : FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }

  // ----------------------------------------------------------
  // BUILD
  // ----------------------------------------------------------

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
              const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment:
                CrossAxisAlignment.stretch,
            children: [
              // ------------------------------------------------
              // SECURE CHECKOUT HEADER
              // ------------------------------------------------

              Container(
                padding:
                    const EdgeInsets.all(18),
                decoration:
                    BoxDecoration(
                  gradient:
                      const LinearGradient(
                    colors: [
                      darkRed,
                      primaryRed,
                    ],
                  ),
                  borderRadius:
                      BorderRadius.circular(
                    20,
                  ),
                ),
                child: const Column(
                  children: [
                    Icon(
                      Icons.lock_outline,
                      color: brightGold,
                      size: 42,
                    ),
                    SizedBox(height: 8),
                    Text(
                      'Secure Payment',
                      style: TextStyle(
                        color:
                            brightGold,
                        fontSize: 23,
                        fontWeight:
                            FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'Your payment is processed securely by Stripe.',
                      textAlign:
                          TextAlign.center,
                      style: TextStyle(
                        color:
                            Colors.white,
                        fontWeight:
                            FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(
                height: 20,
              ),

              // ------------------------------------------------
              // ORDER INFORMATION
              // ------------------------------------------------

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
                  border: Border.all(
                    color: gold,
                  ),
                ),
                child: Column(
                  children: [
                    const Row(
                      children: [
                        Icon(
                          Icons.receipt_long,
                          color:
                              primaryRed,
                        ),
                        SizedBox(width: 10),
                        Text(
                          'Order Details',
                          style:
                              TextStyle(
                            color:
                                primaryRed,
                            fontSize: 18,
                            fontWeight:
                                FontWeight.w900,
                          ),
                        ),
                      ],
                    ),

                    const Divider(
                      height: 25,
                    ),

                    summaryRow(
                      'Country',
                      widget.country,
                    ),

                    summaryRow(
                      'Operator',
                      widget.operator,
                    ),

                    summaryRow(
                      'Phone',
                      widget.phone,
                    ),

                    summaryRow(
                      'Top-up Amount',
                      '${widget.amount} ${widget.currency}',
                    ),

                    summaryRow(
                      'Price',
                      'Calculated by server',
                    ),

                    summaryRow(
                      'Fee',
                      'Calculated by server',
                    ),

                    const Divider(
                      height: 22,
                    ),

                    summaryRow(
                      'Final Total',
                      'Calculated by server',
                      bold: true,
                    ),
                  ],
                ),
              ),

              const SizedBox(
                height: 18,
              ),

              // ------------------------------------------------
              // IMPORTANT PAYMENT NOTICE
              // ------------------------------------------------

              Container(
                padding:
                    const EdgeInsets.all(15),
                decoration:
                    BoxDecoration(
                  color:
                      const Color(0xFFFFF3CD),
                  borderRadius:
                      BorderRadius.circular(
                    15,
                  ),
                  border: Border.all(
                    color:
                        const Color(
                      0xFFE5C565,
                    ),
                  ),
                ),
                child: const Row(
                  crossAxisAlignment:
                      CrossAxisAlignment.start,
                  children: [
                    Icon(
                      Icons.info_outline,
                      color:
                          primaryRed,
                    ),
                    SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        'قیمت، Fee او Bonus باید د Server/Admin له خوا تایید شي. موبایل اپ باید د قیمت وروستۍ اندازه پخپله تحمیل نه کړي.',
                        style:
                            TextStyle(
                          fontWeight:
                              FontWeight.w600,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

              const SizedBox(
                height: 22,
              ),

              // ------------------------------------------------
              // ERROR
              // ------------------------------------------------

              if (errorMessage != null)
                Container(
                  margin:
                      const EdgeInsets.only(
                    bottom: 16,
                  ),
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
                    border: Border.all(
                      color: Colors.red,
                    ),
                  ),
                  child: Row(
                    crossAxisAlignment:
                        CrossAxisAlignment
                            .start,
                    children: [
                      const Icon(
                        Icons.error_outline,
                        color: Colors.red,
                      ),
                      const SizedBox(
                        width: 10,
                      ),
                      Expanded(
                        child: Text(
                          errorMessage!,
                          style:
                              const TextStyle(
                            color:
                                Colors.red,
                            fontWeight:
                                FontWeight.w600,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),

              // ------------------------------------------------
              // STRIPE BUTTON
              // ------------------------------------------------

              FilledButton.icon(
                onPressed:
                    loading
                        ? null
                        : startCheckout,

                icon: loading
                    ? const SizedBox(
                        width: 21,
                        height: 21,
                        child:
                            CircularProgressIndicator(
                          strokeWidth: 2.5,
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
                      ? 'Connecting to Stripe...'
                      : 'Pay Securely with Stripe',
                  style:
                      const TextStyle(
                    fontSize: 16,
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
                  minimumSize:
                      const Size
                          .fromHeight(
                    58,
                  ),
                  shape:
                      RoundedRectangleBorder(
                    borderRadius:
                        BorderRadius.circular(
                      16,
                    ),
                  ),
                ),
              ),

              const SizedBox(
                height: 14,
              ),

              const Row(
                mainAxisAlignment:
                    MainAxisAlignment.center,
                children: [
                  Icon(
                    Icons.lock,
                    size: 16,
                    color: green,
                  ),
                  SizedBox(width: 6),
                  Text(
                    'Secure payment • Stripe',
                    style:
                        TextStyle(
                      color: green,
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
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

  // ----------------------------------------------------------
  // STATUS COLOR
  // ----------------------------------------------------------

  Color statusColor(
    String status,
  ) {
    switch (
        status.toLowerCase()) {
      case 'completed':
      case 'success':
      case 'succeeded':
        return green;

      case 'failed':
      case 'rejected':
      case 'cancelled':
        return Colors.red;

      case 'processing':
      case 'pending':
      case 'paid':
        return Colors.orange;

      default:
        return primaryRed;
    }
  }

  // ----------------------------------------------------------
  // DATE FORMAT
  // ----------------------------------------------------------

  String formatDate(
    DateTime date,
  ) {
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

    return '$day/$month/$year  $hour:$minute';
  }

  // ----------------------------------------------------------
  // BUILD
  // ----------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Top-up History',
          style: TextStyle(
            fontWeight:
                FontWeight.w900,
          ),
        ),
      ),

      body: records.isEmpty
          ? const Center(
              child: Padding(
                padding:
                    EdgeInsets.all(30),
                child: Column(
                  mainAxisAlignment:
                      MainAxisAlignment
                          .center,
                  children: [
                    Icon(
                      Icons.history,
                      size: 70,
                      color: gold,
                    ),
                    SizedBox(height: 14),
                    Text(
                      'No transactions yet',
                      style:
                          TextStyle(
                        fontSize: 20,
                        color:
                            primaryRed,
                        fontWeight:
                            FontWeight.w900,
                      ),
                    ),
                    SizedBox(height: 6),
                    Text(
                      'ستاسو Top-up تاریخچه به دلته ښکاره شي.',
                      textAlign:
                          TextAlign.center,
                    ),
                  ],
                ),
              ),
            )
          : ListView.separated(
              padding:
                  const EdgeInsets.all(
                16,
              ),
              itemCount:
                  records.length,
              separatorBuilder:
                  (_, __) =>
                      const SizedBox(
                height: 10,
              ),
              itemBuilder:
                  (context, index) {
                final record =
                    records[index];

                final color =
                    statusColor(
                  record.status,
                );

                return Container(
                  padding:
                      const EdgeInsets.all(
                    16,
                  ),
                  decoration:
                      BoxDecoration(
                    color: Colors.white,
                    borderRadius:
                        BorderRadius.circular(
                      17,
                    ),
                    border: Border.all(
                      color: gold,
                    ),
                  ),
                  child: Column(
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                            backgroundColor:
                                color.withValues(
                              alpha: .12,
                            ),
                            child: Icon(
                              Icons
                                  .phone_android,
                              color: color,
                            ),
                          ),

                          const SizedBox(
                            width: 12,
                          ),

                          Expanded(
                            child: Column(
                              crossAxisAlignment:
                                  CrossAxisAlignment
                                      .start,
                              children: [
                                Text(
                                  record
                                      .country,
                                  style:
                                      const TextStyle(
                                    color:
                                        primaryRed,
                                    fontWeight:
                                        FontWeight.w900,
                                  ),
                                ),
                                Text(
                                  record.phone,
                                  style:
                                      const TextStyle(
                                    fontWeight:
                                        FontWeight.w600,
                                  ),
                                ),
                              ],
                            ),
                          ),

                          Text(
                            '${record.amount} ${record.currency}',
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
                        children: [
                          Expanded(
                            child: Text(
                              record.operator,
                              style:
                                  const TextStyle(
                                fontWeight:
                                    FontWeight.w700,
                              ),
                            ),
                          ),

                          Container(
                            padding:
                                const EdgeInsets
                                    .symmetric(
                              horizontal: 10,
                              vertical: 5,
                            ),
                            decoration:
                                BoxDecoration(
                              color: color
                                  .withValues(
                                alpha: .10,
                              ),
                              borderRadius:
                                  BorderRadius.circular(
                                20,
                              ),
                            ),
                            child: Text(
                              record.status,
                              style:
                                  TextStyle(
                                color:
                                    color,
                                fontWeight:
                                    FontWeight.w900,
                              ),
                            ),
                          ),
                        ],
                      ),

                      const SizedBox(
                        height: 8,
                      ),

                      Align(
                        alignment:
                            Alignment.centerLeft,
                        child: Text(
                          formatDate(
                            record.date,
                          ),
                          style:
                              const TextStyle(
                            color:
                                Colors.grey,
                            fontSize: 12,
                          ),
                        ),
                      ),

                      if (record
                          .orderId
                          .isNotEmpty) ...[
                        const SizedBox(
                          height: 5,
                        ),
                        Align(
                          alignment:
                              Alignment.centerLeft,
                          child: Text(
                            'Order: ${record.orderId}',
                            style:
                                const TextStyle(
                              color:
                                  Colors.grey,
                              fontSize: 11,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
    );
  }
}
