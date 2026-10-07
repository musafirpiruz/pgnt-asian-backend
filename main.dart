import 'package:flutter/material.dart';

// ==================== CONFIG ====================
class AppConfig {
  static const String appName = "PGNT";
  static const String appVersion = "1.0.0";
  static const double serviceFee = 0.79; // 79 Af fee
  static const String currency = "AFN";
  static const String supportPhone = "+93 700 000 000";
  static const String supportEmail = "support@pgnt.af";
  static const bool isProduction = true;
}

// ==================== COLORS ====================
class AppColors {
  static const Color primaryBg = Color(0xFF1A0505);
  static const Color secondaryBg = Color(0xFF2A0A0A);
  static const Color gold = Color(0xFFD4AF37);
  static const Color goldLight = Color(0xFFF4D06F);
  static const Color white = Color(0xFFFFFFFF);
  static const Color green = Color(0xFF4CAF50);
  static const Color red = Color(0xFFE53935);
  static const Color grey = Color(0xFF9E9E9E);
}

void main() {
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
        scaffoldBackgroundColor: AppColors.primaryBg,
        primaryColor: AppColors.gold,
        fontFamily: 'Roboto',
        appBarTheme: const AppBarTheme(
          backgroundColor: AppColors.primaryBg,
          foregroundColor: AppColors.white,
          elevation: 0,
        ),
      ),
      home: const OnboardingScreen(),
    );
  }
}

// ==================== ONBOARDING ====================
class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override
  State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final PageController _controller = PageController();
  int _current = 0;

  final List<Map<String, String>> _pages = [
    {"title": "PGNT ته ښه راغلاست", "desc": "تر ټولو اسانه او خوندي د پیسو لیږد سیسټم"},
    {"title": "چټک او خوندي", "desc": "یوازې په څو ثانیو کی پیسې ولیږئ"},
    {"title": "24 ساعته خدمت", "desc": "هر وخت، هر ځای کی ستاسو په خدمت کی"},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: PageView.builder(
                controller: _controller,
                onPageChanged: (i) { setState(() { _current = i; }); },
                itemCount: _pages.length,
                itemBuilder: (ctx, i) {
                  return Padding(
                    padding: const EdgeInsets.all(32),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 120, height: 120,
                          decoration: BoxDecoration(
                            color: AppColors.gold,
                            borderRadius: BorderRadius.circular(60),
                          ),
                          child: const Icon(Icons.account_balance_wallet, size: 60, color: AppColors.primaryBg),
                        ),
                        const SizedBox(height: 40),
                        Text(_pages[i]["title"]!, style: const TextStyle(color: AppColors.white, fontSize: 28, fontWeight: FontWeight.bold), textAlign: TextAlign.center),
                        const SizedBox(height: 16),
                        Text(_pages[i]["desc"]!, style: const TextStyle(color: AppColors.grey, fontSize: 16), textAlign: TextAlign.center),
                      ],
                    ),
                  );
                },
              ),
            ),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(_pages.length, (i) => Container(
                margin: const EdgeInsets.all(4),
                width: _current == i ? 24 : 8, height: 8,
                decoration: BoxDecoration(
                  color: _current == i ? AppColors.gold : AppColors.grey,
                  borderRadius: BorderRadius.circular(4),
                ),
              )),
            ),
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity, height: 60,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: AppColors.primaryBg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                  onPressed: function() {
                    if (_current == _pages.length - 1) {
                      Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => const HomeScreen()));
                    } else {
                      _controller.nextPage(duration: const Duration(milliseconds: 300), curve: Curves.easeInOut);
                    }
                  } as void Function()?,
                  child: Text(_current == _pages.length - 1 ? "پیل کړه" : "بل", style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ==================== HOME SCREEN ====================
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  double balance = 12500.50;
  final List<Map<String, dynamic>> quickActions = [
    {"icon": Icons.send, "label": "لیږل"},
    {"icon": Icons.download, "label": "ترلاسه کول"},
    {"icon": Icons.phone_android, "label": "موبایل"},
    {"icon": Icons.receipt, "label": "بل"},
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text("PGNT", style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold)),
        actions: [IconButton(icon: const Icon(Icons.notifications, color: AppColors.white), onPressed: () {})],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: double.infinity, padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                gradient: const LinearGradient(colors: [Color(0xFFD4AF37), Color(0xFFB8962E)]),
                borderRadius: BorderRadius.circular(16),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text("ستاسو بیلانس", style: TextStyle(color: AppColors.primaryBg, fontSize: 14)),
                  const SizedBox(height: 8),
                  Text("${balance.toStringAsFixed(2)} AFN", style: const TextStyle(color: AppColors.primaryBg, fontSize: 32, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 16),
                  Row(children: [
                    const Icon(Icons.visibility, color: AppColors.primaryBg, size: 16),
                    const SizedBox(width: 4),
                    Text("فیس: ${AppConfig.serviceFee} AFN", style: const TextStyle(color: AppColors.primaryBg, fontSize: 12)),
                  ]),
                ],
              ),
            ),
            const SizedBox(height: 24),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceAround,
              children: quickActions.map((a) => Column(children: [
                Container(width: 60, height: 60, decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.gold, width: 1)), child: Icon(a["icon"] as IconData, color: AppColors.gold)),
                const SizedBox(height: 8),
                Text(a["label"] as String, style: const TextStyle(color: AppColors.white, fontSize: 12)),
              ])).toList(),
            ),
            const SizedBox(height: 24),
            const Text("وروستي تراکنشونه", style: TextStyle(color: AppColors.white, fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 12),
            ...List.generate(5, (i) => Container(
              margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)),
              child: Row(children: [
                Container(width: 48, height: 48, decoration: BoxDecoration(color: AppColors.primaryBg, borderRadius: BorderRadius.circular(24)), child: const Icon(Icons.person, color: AppColors.gold)),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text("احمد - ${(1000 + i * 250)} AFN", style: const TextStyle(color: AppColors.white, fontSize: 14, fontWeight: FontWeight.bold)),
                  Text("نن - ${10 + i}:30", style: const TextStyle(color: AppColors.grey, fontSize: 12)),
                ])),
                const Icon(Icons.check_circle, color: AppColors.green, size: 20),
              ]),
            )),
          ],
        ),
      ),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: AppColors.secondaryBg,
        selectedItemColor: AppColors.gold,
        unselectedItemColor: AppColors.grey,
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(icon: Icon(Icons.home), label: "کور"),
          BottomNavigationBarItem(icon: Icon(Icons.history), label: "تاریخچه"),
          BottomNavigationBarItem(icon: Icon(Icons.wallet), label: "والت"),
          BottomNavigationBarItem(icon: Icon(Icons.person), label: "پروفایل"),
        ],
      ),
    );
  }
}

// ==================== CONFIRM SCREEN ====================
class ConfirmScreen extends StatelessWidget {
  final double amount;
  final String receiver;
  const ConfirmScreen({super.key, required this.amount, required this.receiver});

  @override
  Widget build(BuildContext context) {
    double total = amount + AppConfig.serviceFee;
    return Scaffold(
      appBar: AppBar(title: const Text("تایید"), centerTitle: true),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Icon(Icons.account_circle, size: 80, color: AppColors.gold),
            const SizedBox(height: 16),
            Text(receiver, style: const TextStyle(color: AppColors.white, fontSize: 22, fontWeight: FontWeight.bold)),
            const SizedBox(height: 32),
            Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)), child: Column(children: [
              _row("مقدار", "$amount AFN"),
              const Divider(color: AppColors.grey),
              _row("فیس", "${AppConfig.serviceFee} AFN"),
              const Divider(color: AppColors.grey),
              _row("ټول", "$total AFN", isBold: true),
            ])),
            const Spacer(),
            SizedBox(width: double.infinity, height: 60, child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: AppColors.primaryBg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: function() { Navigator.push(context, MaterialPageRoute(builder: (_) => PaymentScreen(amount: amount, receiver: receiver))); } as void Function()?,
              child: const Text("تایید او لیږل", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            )),
          ],
        ),
      ),
    );
  }

  Widget _row(String a, String b, {bool isBold = false}) {
    return Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
      Text(a, style: TextStyle(color: AppColors.grey, fontSize: isBold ? 16 : 14)),
      Text(b, style: TextStyle(color: AppColors.white, fontSize: isBold ? 18 : 14, fontWeight: isBold ? FontWeight.bold : FontWeight.normal)),
    ]);
  }
}

// ==================== PAYMENT SCREEN ====================
class PaymentScreen extends StatefulWidget {
  final double amount;
  final String receiver;
  const PaymentScreen({super.key, required this.amount, required this.receiver});
  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}

class _PaymentScreenState extends State<PaymentScreen> {
  final TextEditingController _pinController = TextEditingController();
  bool _loading = false;

  void _pay() {
    setState(() { _loading = true; });
    Future.delayed(const Duration(seconds: 2), function() {
      if (mounted) {
        Navigator.pushReplacement(context, MaterialPageRoute(builder: (_) => SuccessScreen(amount: widget.amount, receiver: widget.receiver)));
      }
    } as void Function());
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("پټ نوم داخل کړه")),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            const Text("خپل 4 رقمي پټ نوم داخل کړه", style: TextStyle(color: AppColors.white, fontSize: 16), textAlign: TextAlign.center),
            const SizedBox(height: 32),
            TextField(
              controller: _pinController, obscureText: true, maxLength: 4, keyboardType: TextInputType.number, textAlign: TextAlign.center,
              style: const TextStyle(color: AppColors.white, fontSize: 24, letterSpacing: 12),
              decoration: InputDecoration(
                hintText: "****", hintStyle: const TextStyle(color: AppColors.grey),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.gold)),
                focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: const BorderSide(color: AppColors.gold, width: 2)),
              ),
            ),
            const Spacer(),
            SizedBox(width: double.infinity, height: 60, child: ElevatedButton(
              style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: AppColors.primaryBg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
              onPressed: _loading ? null : _pay,
              child: _loading ? const CircularProgressIndicator(color: AppColors.primaryBg) : const Text("تادیه", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            )),
          ],
        ),
      ),
    );
  }
}

// ==================== SUCCESS SCREEN ====================
class SuccessScreen extends StatelessWidget {
  final double amount;
  final String receiver;
  const SuccessScreen({super.key, required this.amount, required this.receiver});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(width: 100, height: 100, decoration: BoxDecoration(color: AppColors.green, borderRadius: BorderRadius.circular(50)), child: const Icon(Icons.check, size: 60, color: AppColors.white)),
              const SizedBox(height: 24),
              const Text("بریالی شو!", style: TextStyle(color: AppColors.white, fontSize: 28, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              Text("$amount AFN په بریالیتوب سره $receiver ته ولیږل شو", style: const TextStyle(color: AppColors.grey, fontSize: 16), textAlign: TextAlign.center),
              const SizedBox(height: 32),
              Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)), child: Column(children: [
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text("د تراکنش شمیره", style: TextStyle(color: AppColors.grey)), Text("PGNT${DateTime.now().millisecondsSinceEpoch}", style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold))]),
                const SizedBox(height: 12),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text("وخت", style: TextStyle(color: AppColors.grey)), Text("${DateTime.now().toString().substring(0,16)}", style: const TextStyle(color: AppColors.white))]),
              ])),
              const Spacer(),
              SizedBox(width: double.infinity, height: 60, child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, foregroundColor: AppColors.primaryBg, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
                onPressed: function() { Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_) => const HomeScreen()), (r) => false); } as void Function()?,
                child: const Text("کور ته لاړ شه", style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
              )),
            ],
          ),
        ),
      ),
    );
  }
}

// ==================== HISTORY SCREEN ====================
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});
  @override
  Widget build(BuildContext context) {
    final List<Map<String, dynamic>> tx = List.generate(12, (i) => {
      "name": i % 2 == 0 ? "احمد" : "محمد",
      "amount": 500 + i * 150,
      "time": "${i+1} ساعته وړاندی",
      "status": i % 3 == 0 ? "ناکام" : "بریالی",
      "type": i % 2 == 0 ? "لیږل" : "ترلاسه",
    });

    return Scaffold(
      appBar: AppBar(title: const Text("تاریخچه")),
      body: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: tx.length,
        itemBuilder: (ctx, i) {
          bool isFail = tx[i]["status"] == "ناکام";
          return Container(
            margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)),
            child: Row(children: [
              Container(width: 48, height: 48, decoration: BoxDecoration(color: isFail ? AppColors.red.withOpacity(0.2) : AppColors.green.withOpacity(0.2), borderRadius: BorderRadius.circular(24)), child: Icon(tx[i]["type"] == "لیږل" ? Icons.arrow_upward : Icons.arrow_downward, color: isFail ? AppColors.red : AppColors.green)),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text("${tx[i]["name"]} - ${tx[i]["amount"]} AFN", style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
                Text("${tx[i]["time"]} - ${tx[i]["status"]}", style: TextStyle(color: isFail ? AppColors.red : AppColors.grey, fontSize: 12)),
              ])),
              Text(tx[i]["type"] as String, style: const TextStyle(color: AppColors.gold, fontSize: 12)),
            ]),
          );
        },
      ),
    );
  }
}

// ==================== WALLET SCREEN ====================
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("والت")),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          Container(width: double.infinity, padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.gold)), child: Column(children: [
            const Text("مجموعي بیلانس", style: TextStyle(color: AppColors.grey)),
            const SizedBox(height: 8),
            const Text("12,500.50 AFN", style: TextStyle(color: AppColors.white, fontSize: 28, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Row(mainAxisAlignment: MainAxisAlignment.spaceEvenly, children: [
              _walletBtn(Icons.add, "اضافه"),
              _walletBtn(Icons.send, "لیږل"),
              _walletBtn(Icons.history, "تاریخچه"),
            ]),
          ])),
          const SizedBox(height: 24),
          Expanded(child: ListView(children: [
            _walletCard("افغاني", "12,500 AFN", Icons.money),
            _walletCard("دالر", "150 USD", Icons.attach_money),
            _walletCard("کارت", "**** 4582", Icons.credit_card),
          ])),
        ]),
      ),
    );
  }

  static Widget _walletBtn(IconData icon, String label) {
    return Column(children: [
      Container(width: 56, height: 56, decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(28)), child: Icon(icon, color: AppColors.primaryBg)),
      const SizedBox(height: 6),
      Text(label, style: const TextStyle(color: AppColors.white, fontSize: 12)),
    ]);
  }

  static Widget _walletCard(String title, String value, IconData icon) {
    return Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)), child: Row(children: [
      Container(width: 48, height: 48, decoration: BoxDecoration(color: AppColors.primaryBg, borderRadius: BorderRadius.circular(12)), child: Icon(icon, color: AppColors.gold)),
      const SizedBox(width: 12),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [Text(title, style: const TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)), Text(value, style: const TextStyle(color: AppColors.grey, fontSize: 12))]),
      const Spacer(),
      const Icon(Icons.arrow_forward_ios, color: AppColors.grey, size: 16),
    ]));
  }
}

// ==================== PROFILE SCREEN ====================
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("پروفایل")),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(children: [
          const SizedBox(height: 16),
          Container(width: 100, height: 100, decoration: BoxDecoration(color: AppColors.gold, borderRadius: BorderRadius.circular(50)), child: const Icon(Icons.person, size: 60, color: AppColors.primaryBg)),
          const SizedBox(height: 12),
          const Text("احمد جان", style: TextStyle(color: AppColors.white, fontSize: 22, fontWeight: FontWeight.bold)),
          const Text("+93 700 123 456", style: TextStyle(color: AppColors.grey)),
          const SizedBox(height: 32),
          _profileItem(Icons.person_outline, "شخصي معلومات"),
          _profileItem(Icons.security, "امنیت"),
          _profileItem(Icons.language, "ژبه"),
          _profileItem(Icons.help_outline, "مرسته"),
          _profileItem(Icons.info_outline, "د اپ په اړه"),
          const SizedBox(height: 24),
          SizedBox(width: double.infinity, height: 56, child: OutlinedButton(
            style: OutlinedButton.styleFrom(side: const BorderSide(color: AppColors.red), foregroundColor: AppColors.red, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12))),
            onPressed: function() {} as void Function()?,
            child: const Text("وتل", style: TextStyle(fontSize: 16)),
          )),
          const SizedBox(height: 16),
          Text("Version ${AppConfig.appVersion} - Fee ${AppConfig.serviceFee} AFN", style: const TextStyle(color: AppColors.grey, fontSize: 10)),
        ]),
      ),
    );
  }

  static Widget _profileItem(IconData icon, String title) {
    return Container(margin: const EdgeInsets.only(bottom: 12), padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.secondaryBg, borderRadius: BorderRadius.circular(12)), child: Row(children: [
      Icon(icon, color: AppColors.gold),
      const SizedBox(width: 12),
      Text(title, style: const TextStyle(color: AppColors.white, fontSize: 14)),
      const Spacer(),
      const Icon(Icons.arrow_forward_ios, color: AppColors.grey, size: 14),
    ]));
  }
}
