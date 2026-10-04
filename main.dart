import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

void main() => runApp(const PgntAsianApp());

const primaryRed = Color(0xFF7A0C10);
const darkRed = Color(0xFF4B0508);
const gold = Color(0xFFD4B896);
const brightGold = Color(0xFFFFD700);
const cream = Color(0xFFFFF8E7);
const green = Color(0xFF18A957);

const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'https://pgnt-asian-backend.onrender.com',
);

class TopUpRecord {
  final String country, operator, phone, status, orderId;
  final int amount, bonus;
  final double price, fee, total;
  final DateTime date;

  const TopUpRecord({
    required this.country,
    required this.operator,
    required this.phone,
    required this.status,
    required this.orderId,
    required this.amount,
    required this.bonus,
    required this.price,
    required this.fee,
    required this.total,
    required this.date,
  });
}

class PgntAsianApp extends StatefulWidget {
  const PgntAsianApp({super.key});
  @override State<PgntAsianApp> createState() => _PgntAsianAppState();
}

class _PgntAsianAppState extends State<PgntAsianApp> {
  String language = 'English';
  double wallet = 24.50;
  final List<TopUpRecord> history = [];

  @override
  Widget build(BuildContext context) => MaterialApp(
    debugShowCheckedModeBanner: false,
    title: 'PGNT ASIAN TOPUP',
    theme: ThemeData(
      useMaterial3: true,
      scaffoldBackgroundColor: cream,
      colorScheme: ColorScheme.fromSeed(seedColor: primaryRed),
      fontFamily: 'sans',
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: Colors.white,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: gold),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: gold),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(16),
          borderSide: BorderSide(color: primaryRed, width: 2),
        ),
      ),
    ),
    home: HomePage(
      language: language,
      wallet: wallet,
      history: history,
      onLanguage: (v) => setState(() => language = v),
      onWallet: (v) => setState(() => wallet = v),
      onHistory: (r) => setState(() => history.insert(0, r)),
    ),
  );
}

class HomePage extends StatefulWidget {
  final String language;
  final double wallet;
  final List<TopUpRecord> history;
  final ValueChanged<String> onLanguage;
  final ValueChanged<double> onWallet;
  final ValueChanged<TopUpRecord> onHistory;

  const HomePage({
    super.key, required this.language, required this.wallet,
    required this.history, required this.onLanguage,
    required this.onWallet, required this.onHistory,
  });

  @override State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  String country = 'Afghanistan';
  String operator = 'Roshan';
  int? amount;
  final phone = TextEditingController();

  final countries = const ['Afghanistan','Pakistan','Bangladesh','India'];
  final languages = const ['English','پښتو','دری','اردو','हिन्दी','বাংলা'];

  List<String> get operators => switch (country) {
    'Afghanistan' => const ['Auto Detect','Roshan','Etisalat','MTN','AWCC'],
    'Pakistan' => const ['Auto Detect','Jazz','Zong','Ufone','Telenor'],
    'Bangladesh' => const ['Auto Detect','Grameenphone','Robi','Banglalink'],
    _ => const ['Auto Detect','Airtel','Jio','Vi'],
  };
    List<int> get amounts => const [100, 250, 500, 1000];

  String get currency => switch (country) {
    'Afghanistan' => 'AFN',
    'Pakistan' => 'PKR',
    'Bangladesh' => 'BDT',
    _ => 'INR',
  };

  String get flag => switch (country) {
    'Afghanistan' => '🇦🇫',
    'Pakistan' => '🇵🇰',
    'Bangladesh' => '🇧🇩',
    _ => '🇮🇳',
  };

  double get productPrice {
    switch (amount) {
      case 100: return 1.64;
      case 250: return 3.89;
      case 500: return 7.49;
      case 1000: return 14.29;
      default: return 0;
    }
  }

  double get fee => productPrice * 0.02;

  int get bonus => switch (amount) {
    100 => 10,
    250 => 35,
    500 => 80,
    _ => 0,
  };

  double get total => productPrice + fee;

  bool get validPhone {
    final d = phone.text.replaceAll(RegExp(r'\D'), '');
    return switch (country) {
      'Afghanistan' => d.length >= 9 && d.length <= 10,
      'Pakistan' => d.length >= 10 && d.length <= 11,
      'Bangladesh' => d.length >= 10 && d.length <= 11,
      _ => d.length >= 10 && d.length <= 12,
    };
  }

  @override
  void dispose() {
    phone.dispose();
    super.dispose();
  }

  void message(String text) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text)),
    );
  }

  void continueTopUp() {
    if (!validPhone) {
      message('مهرباني وکړئ صحیح موبایل شمېره ولیکئ.');
      return;
    }

    if (amount == null) {
      message('مهرباني وکړئ مقدار انتخاب کړئ.');
      return;
    }

    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => CheckoutPage(
          country: country,
          operator: operator,
          phone: phone.text.trim(),
          amount: amount!,
          currency: currency,
          price: productPrice,
          fee: fee,
          bonus: bonus,
          total: total,
          onHistory: widget.onHistory,
        ),
      ),
    );
  }

  void openWallet() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => WalletPage(
          balance: widget.wallet,
          onBalance: widget.onWallet,
        ),
      ),
    );
  }

  void openHistory() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HistoryPage(records: widget.history),
      ),
    );
  }

  void openReferral() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => const ReferralPage(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'PGNT ASIAN TOPUP',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
        actions: [
          IconButton(
            onPressed: openWallet,
            icon: const Icon(Icons.account_balance_wallet_outlined),
          ),
          IconButton(
            onPressed: openHistory,
            icon: const Icon(Icons.history),
          ),
          PopupMenuButton<String>(
            icon: const Icon(Icons.language),
            onSelected: widget.onLanguage,
            itemBuilder: (_) => languages.map(
              (e) => PopupMenuItem(
                value: e,
                child: Text(e),
              ),
            ).toList(),
          ),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const VipHeader(),
              const SizedBox(height: 14),

              WalletCard(
                balance: widget.wallet,
                onTap: openWallet,
              ),

              const SizedBox(height: 22),

              const SectionTitle('Select Country / هیواد انتخاب کړئ'),
              const SizedBox(height: 8),

              DropdownButtonFormField<String>(
                value: country,
                decoration: InputDecoration(
                  prefixIcon: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Text(
                      flag,
                      style: const TextStyle(fontSize: 23),
                    ),
                  ),
                  labelText: 'Country',
                ),
                items: countries.map(
                  (e) => DropdownMenuItem(
                    value: e,
                    child: Text(e),
                  ),
                ).toList(),
                onChanged: (v) {
                  if (v == null) return;
                  setState(() {
                    country = v;
                    operator = operators.first;
                    amount = null;
                  });
                },
              ),

              const SizedBox(height: 18),

              const SectionTitle('Phone Number / موبایل شمېره'),
              const SizedBox(height: 8),

              TextField(
                controller: phone,
                keyboardType: TextInputType.phone,
                inputFormatters: [
                  FilteringTextInputFormatter.allow(
                    RegExp(r'[0-9+ ]'),
                  ),
                ],
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  prefixIcon: const Icon(
                    Icons.phone_android,
                    color: primaryRed,
                  ),
                  hintText: '07XXXXXXXX',
                  suffixIcon: validPhone
                      ? const Icon(
                          Icons.check_circle,
                          color: green,
                        )
                      : null,
                ),
              ),

              const SizedBox(height: 18),

              const SectionTitle('Operator'),
              const SizedBox(height: 8),

              DropdownButtonFormField<String>(
                value: operators.contains(operator)
                    ? operator
                    : operators.first,
                decoration: const InputDecoration(
                  prefixIcon: Icon(
                    Icons.sim_card,
                    color: primaryRed,
                  ),
                  labelText: 'Operator',
                ),
                items: operators.map(
                  (e) => DropdownMenuItem(
                    value: e,
                    child: Text(e),
                  ),
                ).toList(),
                onChanged: (v) {
                  if (v != null) {
                    setState(() => operator = v);
                  }
                },
              ),

              const SizedBox(height: 20),
                            const SectionTitle('Select Amount / مقدار انتخاب کړئ'),
              const SizedBox(height: 10),

              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: amounts.map(
                  (value) {
                    final selected = amount == value;
                    final b = value == 100
                        ? 10
                        : value == 250
                            ? 35
                            : value == 500
                                ? 80
                                : 0;

                    return GestureDetector(
                      onTap: () {
                        setState(() => amount = value);
                      },
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        width: 155,
                        padding: const EdgeInsets.symmetric(
                          vertical: 14,
                          horizontal: 12,
                        ),
                        decoration: BoxDecoration(
                          color: selected
                              ? primaryRed
                              : Colors.white,
                          borderRadius: BorderRadius.circular(14),
                          border: Border.all(
                            color: selected
                                ? primaryRed
                                : gold,
                            width: selected ? 2 : 1,
                          ),
                        ),
                        child: Column(
                          children: [
                            Text(
                              '$value $currency',
                              style: TextStyle(
                                color: selected
                                    ? Colors.white
                                    : primaryRed,
                                fontSize: 17,
                                fontWeight: FontWeight.w900,
                              ),
                            ),
                            if (b > 0)
                              Text(
                                '+ $b Bonus',
                                style: TextStyle(
                                  color: selected
                                      ? brightGold
                                      : green,
                                  fontSize: 12,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ).toList(),
              ),

              const SizedBox(height: 18),

              if (amount != null)
                PriceCard(
                  amount: amount!,
                  currency: currency,
                  price: productPrice,
                  fee: fee,
                  bonus: bonus,
                  total: total,
                ),

              const SizedBox(height: 16),

              InkWell(
                onTap: openReferral,
                borderRadius: BorderRadius.circular(18),
                child: Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(18),
                    border: Border.all(color: gold),
                  ),
                  child: const Row(
                    children: [
                      Icon(
                        Icons.card_giftcard,
                        color: primaryRed,
                        size: 30,
                      ),
                      SizedBox(width: 12),
                      Expanded(
                        child: Text(
                          'Share & Get 50 AFN Bonus • Get €1.50',
                          style: TextStyle(
                            color: primaryRed,
                            fontWeight: FontWeight.w900,
                          ),
                        ),
                      ),
                      Icon(
                        Icons.chevron_right,
                        color: primaryRed,
                      ),
                    ],
                  ),
                ),
              ),

              const SizedBox(height: 20),

              FilledButton.icon(
                onPressed: continueTopUp,
                icon: const Icon(Icons.arrow_forward),
                label: const Text(
                  'Continue →',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w900,
                  ),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: primaryRed,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(58),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(16),
                  ),
                ),
              ),

              const SizedBox(height: 24),

              const Text(
                'Fast • Secure • Reliable',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: primaryRed,
                  fontWeight: FontWeight.w900,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class VipHeader extends StatelessWidget {
  const VipHeader({super.key});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [darkRed, primaryRed],
        ),
        borderRadius: BorderRadius.circular(22),
        boxShadow: const [
          BoxShadow(
            blurRadius: 15,
            offset: Offset(0, 7),
            color: Color(0x35000000),
          ),
        ],
      ),
      child: const Column(
        children: [
          Icon(
            Icons.public,
            color: brightGold,
            size: 50,
          ),
          SizedBox(height: 6),
          Text(
            'PGNT ASIAN TOPUP',
            style: TextStyle(
              color: brightGold,
              fontSize: 27,
              fontWeight: FontWeight.w900,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'Fast • Secure • Reliable',
            style: TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ],
      ),
    );
  }
}

class WalletCard extends StatelessWidget {
  final double balance;
  final VoidCallback onTap;

  const WalletCard({
    super.key,
    required this.balance,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.all(18),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            colors: [primaryRed, Color(0xFF9D181D)],
          ),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Row(
          children: [
            const CircleAvatar(
              radius: 28,
              backgroundColor: brightGold,
              child: Icon(
                Icons.account_balance_wallet,
                color: primaryRed,
                size: 28,
              ),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Wallet Balance',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  Text(
                    '€${balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: brightGold,
                      fontSize: 27,
                      fontWeight: FontWeight.w900,
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
                    fontWeight: FontWeight.w900,
                  ),
                ),
                SizedBox(height: 4),
                Text(
                  '+ Add Money',
                  style: TextStyle(
                    color: Colors.white,
                    fontWeight: FontWeight.w700,
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

class SectionTitle extends StatelessWidget {
  final String text;

  const SectionTitle(this.text, {super.key});

  @override
  Widget build(BuildContext context) {
    return Text(
      text,
      style: const TextStyle(
        color: primaryRed,
        fontSize: 19,
        fontWeight: FontWeight.w900,
      ),
    );
  }
}
class PriceCard extends StatelessWidget {
  final int amount, bonus;
  final String currency;
  final double price, fee, total;

  const PriceCard({
    super.key,
    required this.amount,
    required this.currency,
    required this.price,
    required this.fee,
    required this.bonus,
    required this.total,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: gold),
      ),
      child: Column(
        children: [
          _row('Amount', '$amount $currency'),
          const Divider(),
          _row(
            'Bonus',
            '+ $bonus $currency',
            valueColor: green,
          ),
          _row(
            'Product Price',
            '€${price.toStringAsFixed(2)}',
          ),
          _row(
            'Fee (2%)',
            '€${fee.toStringAsFixed(2)}',
          ),
          const Divider(),
          _row(
            'Total',
            '€${total.toStringAsFixed(2)}',
            large: true,
            valueColor: primaryRed,
          ),
        ],
      ),
    );
  }

  Widget _row(
    String title,
    String value, {
    bool large = false,
    Color? valueColor,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: large ? 18 : 15,
                fontWeight:
                    large ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
          ),
          Text(
            value,
            style: TextStyle(
              fontSize: large ? 20 : 15,
              fontWeight: FontWeight.w900,
              color: valueColor ?? Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}

class CheckoutPage extends StatefulWidget {
  final String country, operator, phone, currency;
  final int amount, bonus;
  final double price, fee, total;
  final ValueChanged<TopUpRecord> onHistory;

  const CheckoutPage({
    super.key,
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.price,
    required this.fee,
    required this.bonus,
    required this.total,
    required this.onHistory,
  });

  @override
  State<CheckoutPage> createState() => _CheckoutPageState();
}

class _CheckoutPageState extends State<CheckoutPage> {
  bool loading = false;

  Future<void> payWithStripe() async {
    if (widget.total <= 0) {
      _msg('د تادیې مقدار صحیح نه دی.');
      return;
    }

    setState(() => loading = true);

    try {
      final response = await http.post(
        Uri.parse(
          '$backendBaseUrl/api/payments/checkout',
        ),
        headers: {
          'Content-Type': 'application/json',
        },
        body: jsonEncode({
          'country': widget.country,
          'operator': widget.operator,
          'phone': widget.phone,
          'amount': widget.amount,
          'currency': widget.currency,
          'price': widget.price,
          'fee': widget.fee,
          'bonus': widget.bonus,
          'total': widget.total,
        }),
      );

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          'Checkout failed: ${response.statusCode}',
        );
      }

      final data = jsonDecode(response.body);

      final url = data['url']?.toString();

      if (url == null || url.isEmpty) {
        throw Exception(
          'Stripe checkout URL not returned.',
        );
      }

      final uri = Uri.parse(url);

      if (!await launchUrl(
        uri,
        mode: LaunchMode.externalApplication,
      )) {
        throw Exception(
          'Could not open Stripe payment page.',
        );
      }

      widget.onHistory(
        TopUpRecord(
          country: widget.country,
          operator: widget.operator,
          phone: widget.phone,
          status: 'Pending',
          orderId: data['orderId']?.toString() ??
              'PGNT-${DateTime.now().millisecondsSinceEpoch}',
          amount: widget.amount,
          bonus: widget.bonus,
          price: widget.price,
          fee: widget.fee,
          total: widget.total,
          date: DateTime.now(),
        ),
      );
    } catch (e) {
      _msg('Checkout ستونزه: $e');
    } finally {
      if (mounted) {
        setState(() => loading = false);
      }
    }
  }

  void _msg(String text) {
    if (!mounted) return;

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(text)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Confirm Top-Up',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            children: [
              const Icon(
                Icons.lock_outline,
                color: primaryRed,
                size: 76,
              ),
              const SizedBox(height: 8),
              const Text(
                'خوندي Payment',
                style: TextStyle(
                  color: primaryRed,
                  fontSize: 27,
                  fontWeight: FontWeight.w900,
                ),
              ),
              const SizedBox(height: 18),

              Container(
                padding: const EdgeInsets.all(20),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: gold),
                ),
                child: Column(
                  children: [
                    _info('Country', widget.country),
                    _info('Operator', widget.operator),
                    _info('Phone', widget.phone),
                    _info(
                      'Amount',
                      '${widget.amount} ${widget.currency}',
                    ),
                    const Divider(),
                    _info(
                      'Bonus',
                      '+ ${widget.bonus} ${widget.currency}',
                      color: green,
                    ),
                    _info(
                      'Product Price',
                      '€${widget.price.toStringAsFixed(2)}',
                    ),
                    _info(
                      'Fee (2%)',
                      '€${widget.fee.toStringAsFixed(2)}',
                    ),
                    const Divider(),
                    _info(
                      'Total',
                      '€${widget.total.toStringAsFixed(2)}',
                      large: true,
                      color: primaryRed,
                    ),
                  ],
                ),
              ),

              const SizedBox(height: 18),

              if (loading)
                const Padding(
                  padding: EdgeInsets.all(18),
                  child: CircularProgressIndicator(
                    color: primaryRed,
                  ),
                ),

              SizedBox(
                width: double.infinity,
                child: FilledButton.icon(
                  onPressed: loading
                      ? null
                      : payWithStripe,
                  icon: const Icon(
                    Icons.credit_card,
                  ),
                  label: Text(
                    loading
                        ? 'Please wait...'
                        : 'Pay €${widget.total.toStringAsFixed(2)} with Stripe →',
                    style: const TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  style: FilledButton.styleFrom(
                    backgroundColor: primaryRed,
                    foregroundColor: Colors.white,
                    minimumSize:
                        const Size.fromHeight(60),
                  ),
                ),
              ),

              const SizedBox(height: 14),

              const Text(
                'Secure payment by Stripe',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.grey,
                  fontWeight: FontWeight.w600,
                ),
              ),

              const SizedBox(height: 10),

              const Text(
                'Visa   •   Mastercard   •   Apple Pay   •   Google Pay',
                textAlign: TextAlign.center,
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _info(
    String title,
    String value, {
    bool large = false,
    Color? color,
  }) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 7),
      child: Row(
        children: [
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: large ? 18 : 15,
                fontWeight:
                    large ? FontWeight.w900 : FontWeight.w600,
              ),
            ),
          ),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: TextStyle(
                fontSize: large ? 20 : 15,
                fontWeight: FontWeight.w900,
                color: color,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
class HistoryPage extends StatelessWidget {
  final List<TopUpRecord> records;

  const HistoryPage({
    super.key,
    required this.records,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Transaction History',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: records.isEmpty
          ? const Center(
              child: Text(
                'No transactions yet.',
                style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                ),
              ),
            )
          : ListView.builder(
              padding: const EdgeInsets.all(14),
              itemCount: records.length,
              itemBuilder: (_, index) {
                final r = records[index];

                return Card(
                  color: Colors.white,
                  margin: const EdgeInsets.only(
                    bottom: 12,
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(15),
                    child: Column(
                      crossAxisAlignment:
                          CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(
                              Icons.sim_card,
                              color: primaryRed,
                            ),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${r.amount} ${r.country == 'Afghanistan' ? 'AFN' : ''}',
                                style: const TextStyle(
                                  fontSize: 18,
                                  fontWeight:
                                      FontWeight.w900,
                                ),
                              ),
                            ),
                            _status(r.status),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          '${r.operator} • ${r.phone}',
                        ),
                        const SizedBox(height: 5),
                        Text(
                          'Order ID: ${r.orderId}',
                          style: const TextStyle(
                            color: Colors.grey,
                            fontSize: 12,
                          ),
                        ),
                        const SizedBox(height: 7),
                        Row(
                          mainAxisAlignment:
                              MainAxisAlignment.spaceBetween,
                          children: [
                            Text(
                              'Bonus: +${r.bonus}',
                              style: const TextStyle(
                                color: green,
                                fontWeight:
                                    FontWeight.w800,
                              ),
                            ),
                            Text(
                              '€${r.total.toStringAsFixed(2)}',
                              style: const TextStyle(
                                color: primaryRed,
                                fontSize: 17,
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

  Widget _status(String status) {
    final pending = status == 'Pending';

    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: 10,
        vertical: 6,
      ),
      decoration: BoxDecoration(
        color: pending
            ? const Color(0xFFFFF0C2)
            : const Color(0xFFD9F7E6),
        borderRadius: BorderRadius.circular(20),
      ),
      child: Text(
        status,
        style: TextStyle(
          color: pending
              ? Colors.orange.shade800
              : green,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class WalletPage extends StatefulWidget {
  final double balance;
  final ValueChanged<double> onBalance;

  const WalletPage({
    super.key,
    required this.balance,
    required this.onBalance,
  });

  @override
  State<WalletPage> createState() => _WalletPageState();
}

class _WalletPageState extends State<WalletPage> {
  late double balance;

  @override
  void initState() {
    super.initState();
    balance = widget.balance;
  }

  void addMoney() {
    setState(() {
      balance += 20;
    });

    widget.onBalance(balance);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text(
          'Wallet demo balance updated. '
          'Real Wallet payment will use Stripe.',
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Wallet',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(25),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [darkRed, primaryRed],
                ),
                borderRadius: BorderRadius.circular(24),
              ),
              child: Column(
                children: [
                  const Text(
                    'Wallet Balance',
                    style: TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    '€${balance.toStringAsFixed(2)}',
                    style: const TextStyle(
                      color: brightGold,
                      fontSize: 34,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '2% Bonus Active 🎁',
                    style: TextStyle(
                      color: brightGold,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 22),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: addMoney,
                icon: const Icon(Icons.add),
                label: const Text(
                  'Add Money',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: primaryRed,
                  minimumSize:
                      const Size.fromHeight(55),
                ),
              ),
            ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: OutlinedButton.icon(
                onPressed: () {},
                icon: const Icon(Icons.account_balance),
                label: const Text(
                  'Withdraw',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                style: OutlinedButton.styleFrom(
                  foregroundColor: primaryRed,
                  minimumSize:
                      const Size.fromHeight(55),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ReferralPage extends StatelessWidget {
  const ReferralPage({super.key});

  @override
  Widget build(BuildContext context) {
    const referral =
        'https://pgnt.asian/r/ABC123';

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          'Referral',
          style: TextStyle(fontWeight: FontWeight.w900),
        ),
      ),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Icon(
              Icons.card_giftcard,
              color: primaryRed,
              size: 80,
            ),
            const SizedBox(height: 12),
            const Text(
              'Invite Friends',
              style: TextStyle(
                color: primaryRed,
                fontSize: 27,
                fontWeight: FontWeight.w900,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Share your link and get 50 AFN free. '
              'Your friend also gets a bonus.',
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            SelectableText(
              referral,
              style: const TextStyle(
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: FilledButton.icon(
                onPressed: () async {
                  final uri = Uri.parse(referral);
                  await launchUrl(
                    uri,
                    mode: LaunchMode.externalApplication,
                  );
                },
                icon: const Icon(Icons.share),
                label: const Text(
                  'Share Now',
                  style: TextStyle(
                    fontWeight: FontWeight.w900,
                  ),
                ),
                style: FilledButton.styleFrom(
                  backgroundColor: primaryRed,
                  minimumSize:
                      const Size.fromHeight(55),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
