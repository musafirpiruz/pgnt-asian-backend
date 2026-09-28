
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PgntAsianApp());
}

const primaryRed = Color(0xFF7A0C10);
const gold = Color(0xFFD4B896);
const brightGold = Color(0xFFFFD700);

// Set this when building the app, for example:
// flutter build apk --dart-define=BACKEND_BASE_URL=https://api.example.com
const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue:'https://pgnt-asian-backend.onrender.com',
const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
);

const pageBg = Color(0xFFF8F5F0);
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

class PgntAsianApp extends StatefulWidget {
  const PgntAsianApp({super.key});

  @override
  State<PgntAsianApp> createState() => _PgntAsianAppState();
}

class _PgntAsianAppState extends State<PgntAsianApp> {
  String language = 'English';
  final List<TopUpRecord> history = [];

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PGNT ASIAN',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: pageBg,
        colorScheme: ColorScheme.fromSeed(
          seedColor: primaryRed,
          primary: primaryRed,
          secondary: brightGold,
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: gold),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: BorderSide(color: gold),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(14),
            borderSide: const BorderSide(color: primaryRed, width: 2),
          ),
        ),
      ),
      home: HomePage(
        language: language,
        history: history,
        onLanguageChanged: (v) => setState(() => language = v),
        onAddHistory: (record) => setState(() => history.insert(0, record)),
      ),
    );
  }
}

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
    'English',
    'پښتو',
    'دری',
    'اردو',
    'हिन्दी',
    'বাংলা',
  ];

  final amounts = const [100, 250, 500, 1000];

  @override
  void dispose() {
    phoneController.dispose();
    super.dispose();
  }

  double get fee => selectedAmount == null ? 0.75 : 0.75;

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

  bool get validPhone =>
      phoneController.text.trim().replaceAll(RegExp(r'\D'), '').length >= 7;

  void continueTopUp() {
    if (!validPhone || selectedAmount == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Please enter a valid phone number and select an amount.'),
        ),
      );
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

  void showHistory() {
    Navigator.push(
      context,
      MaterialPageRoute(
        builder: (_) => HistoryPage(records: widget.history),
      ),
    );
  }

  void showReferral() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 30),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Share & Bonus',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 10),
            const Text(
              'Share the PGNT ASIAN app with a friend. '
              'The production referral reward will be connected to the backend later.',
            ),
            const SizedBox(height: 16),
            SelectableText(
              'PGNT ASIAN\nReferral link placeholder',
              style: TextStyle(
                color: primaryRed,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 16),
            FilledButton.icon(
              onPressed: () {
                Navigator.pop(context);
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text('Share integration will be connected next.'),
                  ),
                );
              },
              icon: const Icon(Icons.share),
              label: const Text('Share App'),
            ),
          ],
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
        title: const Text(
          'PGNT ASIAN',
          style: TextStyle(fontWeight: FontWeight.w800),
        ),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.language),
            onSelected: widget.onLanguageChanged,
            itemBuilder: (_) => languages
                .map((l) => PopupMenuItem(value: l, child: Text(l)))
                .toList(),
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
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              _HeaderCard(onReferral: showReferral),
              const SizedBox(height: 18),
              _SectionTitle(title: 'Select country'),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: country,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.public),
                ),
                items: countries
                    .map((c) => DropdownMenuItem(value: c, child: Text(c)))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() {
                    country = v;
                    operator = 'Auto Detect';
                    selectedAmount = null;
                  });
                },
              ),
              const SizedBox(height: 16),
              _SectionTitle(title: 'Mobile number'),
              const SizedBox(height: 8),
              TextField(
                controller: phoneController,
                keyboardType: TextInputType.phone,
                onChanged: (_) => setState(() {}),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.phone_android),
                  hintText: country == 'Afghanistan'
                      ? '07xxxxxxxx'
                      : 'Enter mobile number',
                  suffixIcon: validPhone
                      ? const Icon(Icons.check_circle, color: Colors.green)
                      : null,
                ),
              ),
              const SizedBox(height: 16),
              _SectionTitle(title: 'Operator'),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                value: operator,
                decoration: const InputDecoration(
                  prefixIcon: Icon(Icons.sim_card),
                ),
                items: const [
                  DropdownMenuItem(
                    value: 'Auto Detect',
                    child: Text('Auto Detect'),
                  ),
                  DropdownMenuItem(
                    value: 'Manual Selection',
                    child: Text('Manual Selection'),
                  ),
                ],
                onChanged: (v) => setState(() => operator = v ?? 'Auto Detect'),
              ),
              const SizedBox(height: 16),
              _SectionTitle(title: 'Select amount'),
              const SizedBox(height: 8),
              Wrap(
                spacing: 10,
                runSpacing: 10,
                children: amounts.map((amount) {
                  final selected = selectedAmount == amount;
                  return ChoiceChip(
                    label: Text('$amount $currency'),
                    selected: selected,
                    selectedColor: brightGold,
                    onSelected: (_) =>
                        setState(() => selectedAmount = amount),
                  );
                }).toList(),
              ),
              const SizedBox(height: 20),
              _FeeCard(amount: selectedAmount, fee: fee, currency: currency),
              const SizedBox(height: 20),
              FilledButton(
                onPressed: continueTopUp,
                style: FilledButton.styleFrom(
                  backgroundColor: primaryRed,
                  foregroundColor: Colors.white,
                  minimumSize: const Size.fromHeight(54),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14),
                  ),
                ),
                child: const Text(
                  'SEND - Instant',
                  style: TextStyle(fontSize: 17, fontWeight: FontWeight.w800),
                ),
              ),
              const SizedBox(height: 12),
              OutlinedButton.icon(
                onPressed: showHistory,
                icon: const Icon(Icons.receipt_long),
                label: const Text('View Top-up History'),
              ),
              const SizedBox(height: 24),
              const Center(
                child: Text(
                  'PGNT ASIAN • First functional prototype',
                  style: TextStyle(color: Colors.black54),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HeaderCard extends StatelessWidget {
  final VoidCallback onReferral;

  const _HeaderCard({required this.onReferral});

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: primaryRed,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          children: [
            Container(
              width: 58,
              height: 58,
              decoration: BoxDecoration(
                color: brightGold,
                borderRadius: BorderRadius.circular(16),
              ),
              child: const Icon(Icons.phone_android,
                  color: primaryRed, size: 34),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Mobile Top Up',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 22,
                      fontWeight: FontWeight.w900,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Fast • Simple • Secure',
                    style: TextStyle(color: Colors.white70),
                  ),
                ],
              ),
            ),
            IconButton(
              onPressed: onReferral,
              icon: const Icon(Icons.share, color: Colors.white),
            ),
          ],
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  final String title;

  const _SectionTitle({required this.title});

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.w800,
        color: primaryRed,
      ),
    );
  }
}

class _FeeCard extends StatelessWidget {
  final int? amount;
  final double fee;
  final String currency;

  const _FeeCard({
    required this.amount,
    required this.fee,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    final total = amount == null ? null : amount! + 0.75;
    return Card(
      elevation: 0,
      color: Colors.white,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(16),
        side: BorderSide(color: gold),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text('Transaction fee'),
                Text('€${fee.toStringAsFixed(2)}'),
              ],
            ),
            const Divider(height: 20),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                const Text(
                  'Top-up',
                  style: TextStyle(fontWeight: FontWeight.w700),
                ),
                Text(
                  amount == null ? '--' : '$amount $currency',
                  style: const TextStyle(fontWeight: FontWeight.w700),
                ),
              ],
            ),
            if (total != null) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Prototype total'),
                  Text('€${total.toStringAsFixed(2)}'),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}

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
            Uri.parse('$backendBaseUrl/api/payments/checkout'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({
              'country': _countryCode(widget.country),
              'phone': widget.phone,
              'amount': widget.amount,
            }),
          )
          .timeout(const Duration(seconds: 30));

      final data = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(data['error']?.toString() ?? 'Checkout failed.');
      }

      final checkoutUrl = data['checkoutUrl']?.toString();
      if (checkoutUrl == null || checkoutUrl.isEmpty) {
        throw Exception('Stripe Checkout URL was not returned.');
      }

      final uri = Uri.tryParse(checkoutUrl);
      if (uri == null || !await canLaunchUrl(uri)) {
        throw Exception('Could not open Stripe Checkout.');
      }

      await launchUrl(uri, mode: LaunchMode.externalApplication);

      if (!mounted) return;
      await showDialog(
        context: context,
        builder: (_) => AlertDialog(
          title: const Text('Stripe Checkout opened'),
          content: const Text(
            'Complete your payment in the browser.\n\n'
            'After payment, Stripe will notify the secure backend. '
            'The backend—not the app—will handle the DT One top-up.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('OK'),
            ),
          ],
        ),
      );
    } catch (e) {
      if (mounted) _showError(e.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) setState(() => processing = false);
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
      SnackBar(content: Text(message)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Confirm Top-up'),
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
      ),
      body: Padding(
        padding: const EdgeInsets.all(18),
        child: Column(
          children: [
            _SummaryRow(label: 'Country', value: widget.country),
            _SummaryRow(label: 'Phone', value: widget.phone),
            _SummaryRow(
              label: 'Amount',
              value: '${widget.amount} ${widget.currency}',
            ),
            _SummaryRow(
              label: 'Service fee',
              value: '€${widget.fee.toStringAsFixed(2)}',
            ),
            const Spacer(),
            const Text(
              'Secure payment: Stripe Checkout. After successful payment, the backend will process the DT One top-up.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black54),
            ),
            const SizedBox(height: 14),
            FilledButton(
              onPressed: processing ? null : startStripeCheckout,
              style: FilledButton.styleFrom(
                backgroundColor: primaryRed,
                minimumSize: const Size.fromHeight(54),
              ),
              child: processing
                  ? const CircularProgressIndicator(color: Colors.white)
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

class _SummaryRow extends StatelessWidget {
  final String label;
  final String value;

  const _SummaryRow({required this.label, required this.value});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: const BoxDecoration(
        border: Border(bottom: BorderSide(color: Color(0xFFE5DDD3))),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.black54)),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(fontWeight: FontWeight.w800),
            ),
          ),
        ],
      ),
    );
  }
}

class HistoryPage extends StatelessWidget {
  final List<TopUpRecord> records;

  const HistoryPage({super.key, required this.records});

  String dateText(DateTime d) =>
      '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')} '
      '${d.hour.toString().padLeft(2, '0')}:${d.minute.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Top-up History'),
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
      ),
      body: records.isEmpty
          ? const Center(
              child: Text(
                'No transactions yet.',
                style: TextStyle(fontSize: 17),
              ),
            )
          : ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: records.length,
              separatorBuilder: (_, __) => const SizedBox(height: 10),
              itemBuilder: (_, i) {
                final r = records[i];
                return Card(
                  child: ListTile(
                    leading: const CircleAvatar(
                      backgroundColor: primaryRed,
                      child: Icon(Icons.check, color: Colors.white),
                    ),
                    title: Text('${r.amount} • ${r.country}'),
                    subtitle: Text(
                      '${r.phone}\n${dateText(r.date)}\n${r.status}',
                    ),
                    isThreeLine: true,
                    trailing: Text(
                      '€${r.fee.toStringAsFixed(2)}',
                      style: const TextStyle(fontWeight: FontWeight.bold),
                    ),
                  ),
                );
              },
            ),
    );
  }
}
