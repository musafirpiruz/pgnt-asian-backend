import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

// ===== PGNT CONFIG - برخه 1/3 =====
class AppConfig {
  static const double transferFee = 0.79;
  static const String appName = 'PGNT';
  static const String currency = 'AFN';
  static const String supportPhone = '+93 79 000 0000';
  static const String version = '1.0.3-fixed';
  static const bool debug = false;
}

class AppColors {
  static const primary = Color(0xFF1A0505);
  static const gold = Color(0xFFD4AF37);
  static const success = Color(0xFF10B981);
  static const background = Color(0xFFFFFBEB);
  static const cardBg = Color(0xFFFFFFFF);
  static const textDark = Color(0xFF1F2937);
  static const textLight = Color(0xFF6B7280);
  static const error = Color(0xFFEF4444);
}

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(
    const SystemUiOverlayStyle(
      statusBarColor: Colors.transparent,
      statusBarIconBrightness: Brightness.light,
    ),
  );
  runApp(const PGNTApp());
}

class PGNTApp extends StatelessWidget {
  const PGNTApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: AppConfig.appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        primaryColor: AppColors.primary,
        scaffoldBackgroundColor: AppColors.background,
        fontFamily: 'Vazirmatn',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: AppColors.primary,
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
      ),
      home: const OnboardingScreen(),
    );
  }
}

// ===== ONBOARDING =====
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});

  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _current = 0;

  final List<Map<String, String>> _pages = [
    {
      'title': 'PGNT ته ښه راغلاست',
      'desc': 'چټک، خوندي او اسانه پیسو لیږد',
      'icon': 'wallet',
    },
    {
      'title': 'یوازې 0.79 فیس',
      'desc': 'تر ټولو ټیټ فیس په ټول افغانستان کې',
      'icon': 'fee',
    },
    {
      'title': 'همدا اوس پیل وکړئ',
      'desc': 'خپل حساب جوړ کړئ او لیږد پیل کړئ',
      'icon': 'start',
    },
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) {
                  setState(() {
                    _current = i;
                  });
                },
                itemCount: _pages.length,
                itemBuilder: (context, index) {
                  return _buildPage(_pages[index]);
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (index) {
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  margin: const EdgeInsets.all(4),
                  width: _current == index ? 28 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: _current == index ? AppColors.gold : Colors.white38,
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            const SizedBox(height: 24),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    if (_current < _pages.length - 1) {
                      _controller.nextPage(
                        duration: const Duration(milliseconds: 300),
                        curve: Curves.easeInOut,
                      );
                    } else {
                      Navigator.pushReplacement(
                        context,
                        MaterialPageRoute(builder: (context) => const MainScreen()),
                      );
                    }
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.gold,
                    foregroundColor: AppColors.primary,
                  ),
                  child: Text(
                    _current == _pages.length - 1 ? 'پیل کول 🚀' : 'بل →',
                    style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildPage(Map<String, String> data) {
    return Padding(
      padding: const EdgeInsets.all(32),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 120,
            height: 120,
            decoration: BoxDecoration(
              color: AppColors.gold.withOpacity(0.15),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.gold, width: 2),
            ),
            child: const Icon(Icons.account_balance_wallet, size: 60, color: AppColors.gold),
          ),
          const SizedBox(height: 32),
          Text(
            data['title']!,
            style: const TextStyle(fontSize: 28, fontWeight: FontWeight.bold, color: Colors.white),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 16),
          Text(
            data['desc']!,
            style: TextStyle(fontSize: 16, color: Colors.white.withOpacity(0.8)),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }
}

// ===== MAIN SCREEN - START =====
class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _selectedIndex = 0;

  final List<Widget> _screens = [
    const HomeScreen(),
    const HistoryScreen(),
    const WalletScreen(),
    const ProfileScreen(),
  ];
  // ===== برخه 2/3 - دوام =====

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_selectedIndex],
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: _selectedIndex,
        onTap: (index) {
          setState(() {
            _selectedIndex = index;
          });
        },
        type: BottomNavigationBarType.fixed,
        backgroundColor: Colors.white,
        selectedItemColor: AppColors.primary,
        unselectedItemColor: AppColors.textLight,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: 'کور'),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: 'تاریخچه'),
          BottomNavigationBarItem(icon: Icon(Icons.wallet), label: 'بټوه'),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: 'پروفایل'),
        ],
      ),
    );
  }
}

// ===== HOME SCREEN - اصلي پاڼه =====
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String _selectedCountry = 'افغانستان 🇦🇫';
  String _selectedOperator = 'روشن';
  final TextEditingController _phoneController = TextEditingController();
  final TextEditingController _amountController = TextEditingController();
  double _amount = 0.0;

  final List<String> _countries = ['افغانستان 🇦🇫', 'ایران 🇮🇷', 'پاکستان 🇵🇰', 'ترکیه 🇹🇷'];
  final List<String> _operators = ['روشن', 'اتصالات', 'ام ټي ان', 'سلام'];

  double get _fee => AppConfig.transferFee;
  double get _total => _amount + _fee;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PGNT - پیسې واستوئ'),
        centerTitle: true,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Balance Card
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [AppColors.primary, Color(0xFF3A0A0A)],
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('ستاسو بیلانس', style: TextStyle(color: Colors.white.withOpacity(0.8))),
                      const Icon(Icons.visibility, color: AppColors.gold, size: 20),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    '12,450.00 AFN',
                    style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
                  ),
                  const SizedBox(height: 4),
                  Text('+2.5% نن', style: TextStyle(color: AppColors.success.withOpacity(0.9))),
                ],
              ),
            ),
            const SizedBox(height: 24),

            _buildDropdown('هیواد انتخاب کړئ', _selectedCountry, _countries, (val) {
              setState(() {
                _selectedCountry = val!;
              });
            }),
            const SizedBox(height: 16),

            _buildTextField('د ترلاسه کوونکي شمیره', _phoneController, Icons.phone, '07XX XXX XXX'),
            const SizedBox(height: 16),

            _buildDropdown('شبکه / اپراتور', _selectedOperator, _operators, (val) {
              setState(() {
                _selectedOperator = val!;
              });
            }),
            const SizedBox(height: 16),

            _buildTextField('مقدار (AFN)', _amountController, Icons.attach_money, '0.00', onChanged: (v) {
              setState(() {
                _amount = double.tryParse(v) ?? 0.0;
              });
            }),
            const SizedBox(height: 24),

            // Fee Summary Card
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey.shade200),
              ),
              child: Column(
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('مقدار'),
                      Text('${_amount.toStringAsFixed(2)} AFN', style: const TextStyle(fontWeight: FontWeight.bold)),
                    ],
                  ),
                  const SizedBox(height: 8),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('فیس'),
                      Text('${_fee.toStringAsFixed(2)} AFN', style: const TextStyle(color: AppColors.success)),
                    ],
                  ),
                  const Divider(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('ټولټال', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                      Text('${_total.toStringAsFixed(2)} AFN', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16, color: AppColors.primary)),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),

            // Continue Button - FIXED with () { }
            SizedBox(
              height: 56,
              child: ElevatedButton(
                onPressed: () {
                  if (_phoneController.text.isEmpty || _amount <= 0) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('لطفاً ټول معلومات ډک کړئ')),
                    );
                    return;
                  }
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => ConfirmScreen(
                        phone: _phoneController.text,
                        amount: _amount,
                        operator: _selectedOperator,
                        country: _selectedCountry,
                      ),
                    ),
                  );
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  foregroundColor: Colors.white,
                ),
                child: const Text('ادامه ورکړئ →', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildDropdown(String label, String value, List<String> items, void Function(String?) onChanged) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(
            color: Colors.white,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: Colors.grey.shade300),
          ),
          child: DropdownButtonHideUnderline(
            child: DropdownButton<String>(
              value: value,
              isExpanded: true,
              items: items.map((e) {
                return DropdownMenuItem(value: e, child: Text(e));
              }).toList(),
              onChanged: onChanged,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildTextField(String label, TextEditingController controller, IconData icon, String hint, {void Function(String)? onChanged}) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
        const SizedBox(height: 8),
        TextField(
          controller: controller,
          keyboardType: label.contains('مقدار') ? TextInputType.number : TextInputType.phone,
          onChanged: onChanged,
          decoration: InputDecoration(
            prefixIcon: Icon(icon),
            hintText: hint,
            filled: true,
            fillColor: Colors.white,
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
          ),
        ),
      ],
    );
  }
}

// ===== CONFIRM SCREEN =====
class ConfirmScreen extends StatelessWidget {
  final String phone;
  final double amount;
  final String operator;
  final String country;

  const ConfirmScreen({
    super.key,
    required this.phone,
    required this.amount,
    required this.operator,
    required this.country,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('تایید')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          children: [
            const Icon(Icons.check_circle, size: 80, color: AppColors.success),
            const SizedBox(height: 20),
            const Text('معلومات تایید کړئ', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            const SizedBox(height: 32),
            _row('هیواد', country),
            _row('شمیره', phone),
            _row('اپراتور', operator),
            _row('مقدار', '${amount.toStringAsFixed(2)} AFN'),
            _row('فیس', '${AppConfig.transferFee} AFN'),
            const Divider(height: 32),
            _row('ټولټال', '${(amount + AppConfig.transferFee).toStringAsFixed(2)} AFN', bold: true),
            const Spacer(),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: ElevatedButton(
                onPressed: () {
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (context) => PaymentScreen(
                        phone: phone,
                        amount: amount,
                        operator: operator,
                      ),
                    ),
                  );
                },
                child: const Text('تایید او پیسې واستوئ', style: TextStyle(fontSize: 18)),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _row(String label, String value, {bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: TextStyle(color: AppColors.textLight, fontWeight: bold ? FontWeight.bold : FontWeight.normal)),
          Text(value, style: TextStyle(fontWeight: bold ? FontWeight.bold : FontWeight.w600, fontSize: bold ? 18 : 16)),
        ],
      ),
    );
  }
}
// ===== برخه 3/3 - پای =====

// ===== PAYMENT SCREEN =====
class PaymentScreen extends StatefulWidget {
  final String phone;
  final double amount;
  final String operator;

  const PaymentScreen({
    super.key,
    required this.phone,
    required this.amount,
    required this.operator,
  });

  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  bool _isProcessing = true;
  bool _isSuccess = false;

  @override
  void initState() {
    super.initState();
    // FIXED: use () {} not function()
    Future.delayed(const Duration(seconds: 3), () {
      setState(() {
        _isProcessing = false;
        _isSuccess = true;
      });
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('پرداخت')),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              if (_isProcessing) ...[
                const CircularProgressIndicator(color: AppColors.primary, strokeWidth: 4),
                const SizedBox(height: 24),
                const Text('پرداخت روان دی...', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
                const SizedBox(height: 12),
                Text('لطفاً انتظار وکړئ', style: TextStyle(color: AppColors.textLight)),
              ] else if (_isSuccess) ...[
                Container(
                  width: 100,
                  height: 100,
                  decoration: const BoxDecoration(color: AppColors.success, shape: BoxShape.circle),
                  child: const Icon(Icons.check, size: 60, color: Colors.white),
                ),
                const SizedBox(height: 24),
                const Text('پرداخت بریالی شو!', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
                const SizedBox(height: 32),
                SizedBox(
                  width: double.infinity,
                  height: 56,
                  child: ElevatedButton(
                    onPressed: () {
                      Navigator.pushAndRemoveUntil(
                        context,
                        MaterialPageRoute(
                          builder: (context) => SuccessScreen(amount: widget.amount, phone: widget.phone),
                        ),
                        (route) => false,
                      );
                    },
                    child: const Text('ادامه →'),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

// ===== SUCCESS SCREEN =====
class SuccessScreen extends StatelessWidget {
  final double amount;
  final String phone;

  const SuccessScreen({super.key, required this.amount, required this.phone});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.primary,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: AppColors.gold,
                  shape: BoxShape.circle,
                  border: Border.all(color: Colors.white, width: 4),
                ),
                child: const Icon(Icons.check, size: 70, color: AppColors.primary),
              ),
              const SizedBox(height: 32),
              const Text(
                'لیږد بریالی شو! 🎉',
                style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold, color: Colors.white),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                '${amount.toStringAsFixed(2)} AFN په بریالیتوب سره واستول شو',
                style: TextStyle(fontSize: 16, color: Colors.white.withOpacity(0.9)),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 8),
              Text(
                'ته: $phone',
                style: TextStyle(fontSize: 14, color: Colors.white.withOpacity(0.7)),
              ),
              const SizedBox(height: 32),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: AppColors.gold.withOpacity(0.3)),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('د تعقیب کوډ', style: TextStyle(color: Colors.white.withOpacity(0.8))),
                    const Text('PGNT-2024-8871', style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold, letterSpacing: 1)),
                  ],
                ),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 56,
                child: ElevatedButton(
                  onPressed: () {
                    Navigator.pushAndRemoveUntil(
                      context,
                      MaterialPageRoute(builder: (context) => const MainScreen()),
                      (route) => false,
                    );
                  },
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: AppColors.primary),
                  child: const Text('کور ته لاړ شئ', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: () {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('رسید ډاونلوډ شو')),
                  );
                },
                child: Text('رسید ډاونلوډ 📥', style: TextStyle(color: Colors.white.withOpacity(0.8))),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ===== HISTORY SCREEN =====
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> transactions = [
      {'phone': '0799 123 456', 'amount': 500.0, 'status': 'بریالی', 'date': 'نن 14:30', 'op': 'روشن'},
      {'phone': '0788 987 654', 'amount': 1200.0, 'status': 'بریالی', 'date': 'پرون', 'op': 'اتصالات'},
      {'phone': '0744 555 222', 'amount': 250.0, 'status': 'په انتظار', 'date': '2 ورځې وړاندې', 'op': 'سلام'},
    ];

    return Scaffold(
      appBar: AppBar(title: const Text('تاریخچه')),
      body: ListView.separated(
        padding: const EdgeInsets.all(16),
        itemCount: transactions.length,
        separatorBuilder: (context, index) => const SizedBox(height: 12),
        itemBuilder: (context, index) {
          final tx = transactions[index];
          return Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
            child: Row(
              children: [
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(color: AppColors.primary.withOpacity(0.1), borderRadius: BorderRadius.circular(8)),
                  child: const Icon(Icons.phone, color: AppColors.primary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(tx['phone'], style: const TextStyle(fontWeight: FontWeight.bold)),
                      Text('${tx['op']} • ${tx['date']}', style: TextStyle(fontSize: 12, color: AppColors.textLight)),
                    ],
                  ),
                ),
                Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text('${tx['amount']} AFN', style: const TextStyle(fontWeight: FontWeight.bold)),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(color: tx['status'] == 'بریالی' ? AppColors.success.withOpacity(0.15) : Colors.orange.withOpacity(0.15), borderRadius: BorderRadius.circular(4)),
                      child: Text(tx['status'], style: TextStyle(fontSize: 10, color: tx['status'] == 'بریالی' ? AppColors.success : Colors.orange, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ===== WALLET SCREEN =====
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('زما بټوه')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(24),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [AppColors.primary, Color(0xFF4A0A0A)], begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(20),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text('ټول بیلانس', style: TextStyle(color: Colors.white.withOpacity(0.8))),
                      Container(padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4), decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(20)), child: const Text('VIP', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: AppColors.primary))),
                    ],
                  ),
                  const SizedBox(height: 16),
                  const Text('12,450.00 AFN', style: TextStyle(fontSize: 36, fontWeight: FontWeight.bold, color: Colors.white)),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(child: _walletAction(Icons.add, 'اضافه')),
                      const SizedBox(width: 12),
                      Expanded(child: _walletAction(Icons.swap_horiz, 'تبادله')),
                      const SizedBox(width: 12),
                      Expanded(child: _walletAction(Icons.history, 'تاریخچه')),
                    ],
                  ),
                ],
              ),
            ),
            const SizedBox(height: 24),
            _walletRow('د کارت سره اضافه کول', Icons.credit_card),
            _walletRow('د بانک له لارې', Icons.account_balance),
            _walletRow('حواله', Icons.receipt),
          ],
        ),
      ),
    );
  }

  Widget _walletAction(IconData icon, String label) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12),
      decoration: BoxDecoration(color: Colors.white.withOpacity(0.15), borderRadius: BorderRadius.circular(12)),
      child: Column(
        children: [
          Icon(icon, color: Colors.white, size: 24),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(color: Colors.white, fontSize: 12)),
        ],
      ),
    );
  }

  Widget _walletRow(String title, IconData icon) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Row(
        children: [
          Container(width: 40, height: 40, decoration: BoxDecoration(color: AppColors.gold.withOpacity(0.2), borderRadius: BorderRadius.circular(8)), child: Icon(icon, color: AppColors.primary)),
          const SizedBox(width: 12),
          Expanded(child: Text(title, style: const TextStyle(fontWeight: FontWeight.w600))),
          const Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.textLight),
        ],
      ),
    );
  }
}

// ===== PROFILE SCREEN =====
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('پروفایل')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              width: 100,
              height: 100,
              decoration: BoxDecoration(shape: BoxShape.circle, border: Border.all(color: AppColors.gold, width: 3), color: AppColors.primary.withOpacity(0.1)),
              child: const Icon(Icons.person, size: 60, color: AppColors.primary),
            ),
            const SizedBox(height: 16),
            const Text('احمد خان', style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
            Text('+93 79 000 0000', style: TextStyle(color: AppColors.textLight)),
            const SizedBox(height: 24),
            _profileItem(Icons.person_outline, 'شخصي معلومات'),
            _profileItem(Icons.security, 'امنیت او پاسورډ'),
            _profileItem(Icons.language, 'ژبه - پښتو'),
            _profileItem(Icons.help_outline, 'مرسته او ملاتړ'),
            _profileItem(Icons.info_outline, 'د اپلیکیشن په اړه'),
            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              height: 56,
              child: OutlinedButton(
                onPressed: () {},
                style: OutlinedButton.styleFrom(foregroundColor: AppColors.error, side: const BorderSide(color: AppColors.error)),
                child: const Text('وتل'),
              ),
            ),
            const SizedBox(height: 16),
            Text('نسخه ${AppConfig.version} • فیس ${AppConfig.transferFee} AFN', style: TextStyle(fontSize: 12, color: AppColors.textLight)),
          ],
        ),
      ),
    );
  }

  Widget _profileItem(IconData icon, String title) {
    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12), border: Border.all(color: Colors.grey.shade200)),
      child: Row(
        children: [
          Icon(icon, color: AppColors.primary),
          const SizedBox(width: 12),
          Expanded(child: Text(title)),
          const Icon(Icons.arrow_forward_ios, size: 16, color: AppColors.textLight),
        ],
      ),
    );
  }
}
