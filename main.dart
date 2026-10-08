import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PGNTApp());
}

class AppConfig {
  static double fee = 0.79; // €0.79 - یورو
  static Map<String, Map<int, int>> bonuses = {
    'AFN': {100: 10, 250: 35, 500: 80, 1000: 150},
    'PKR': {100: 5, 500: 25, 1000: 60},
    'BDT': {100: 5, 500: 30, 1000: 70},
    'INR': {100: 10, 500: 50, 1000: 110},
  };
  static Map<String, Map<int, double>> prices = {
    'AFN': {100: 1.64, 250: 4.10, 500: 8.20, 1000: 16.40},
    'PKR': {100: 0.35, 500: 1.70, 1000: 3.40},
    'BDT': {100: 0.85, 500: 4.20, 1000: 8.50},
    'INR': {100: 1.10, 500: 5.50, 1000: 11.00},
  };
  static String backendUrl = 'https://pgnt-asian-backend.onrender.com';
  static bool feeIsPercentage = false;
  static double feePercentage = 2.0;
}

class AppColors {
  static const bg = Color(0xFF1A0505);
  static const card = Color(0xFF2A0A0A);
  static const gold = Color(0xFFD4AF37);
  static const goldLight = Color(0xFFFFD700);
  static const white = Colors.white;
  static const grey = Color(0xFF8B7355);
}

class PGNTApp extends StatelessWidget {
  const PGNTApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PGNT ASIAN TOPUP',
      theme: ThemeData(
        scaffoldBackgroundColor: AppColors.bg,
        fontFamily: 'Inter',
        useMaterial3: true,
      ),
      home: const OnboardingScreen(),
    );
  }
}
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Container(
                width: 100, height: 100,
                decoration: BoxDecoration(
                  color: AppColors.gold,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: const Icon(Icons.phone_iphone, size: 50, color: AppColors.bg),
              ),
              const SizedBox(height: 24),
              const Text('PGNT ASIAN', style: TextStyle(color: AppColors.white, fontSize: 32, fontWeight: FontWeight.bold)),
              const Text('TOPUP', style: TextStyle(color: AppColors.gold, fontSize: 32, fontWeight: FontWeight.bold)),
              const SizedBox(height: 12),
              const Text('Fast & Secure Mobile Top-Up', style: TextStyle(color: AppColors.grey, fontSize: 16)),
              const Spacer(),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.gold.withOpacity(0.2))),
                child: Column(
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.verified, color: AppColors.gold, size: 20),
                        const SizedBox(width: 8),
                        Text('Fee: €${AppConfig.fee}  •  Instant Bonus', style: TextStyle(color: AppColors.white, fontSize: 13)),
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity, height: 56,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                  onPressed: ()=> Navigator.pushReplacement(context, MaterialPageRoute(builder: (_)=> const MainScreen())),
                  child: const Text('Get Started', style: TextStyle(color: AppColors.bg, fontSize: 18, fontWeight: FontWeight.bold)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});
  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> {
  int _currentIndex = 0;
  final List<Widget> _screens = [
    const HomeScreen(),
    const HistoryScreen(),
    const WalletScreen(),
    const ProfileScreen(),
  ];
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: _screens[_currentIndex],
      bottomNavigationBar: Container(
        decoration: BoxDecoration(color: AppColors.card, border: Border(top: BorderSide(color: AppColors.gold.withOpacity(0.2)))),
        child: BottomNavigationBar(
          currentIndex: _currentIndex,
          onTap: (i)=> setState(()=> _currentIndex = i),
          backgroundColor: AppColors.card,
          selectedItemColor: AppColors.gold,
          unselectedItemColor: AppColors.grey,
          type: BottomNavigationBarType.fixed,
          items: const [
            BottomNavigationBarItem(icon: Icon(Icons.home), label: 'Home'),
            BottomNavigationBarItem(icon: Icon(Icons.history), label: 'History'),
            BottomNavigationBarItem(icon: Icon(Icons.account_balance_wallet), label: 'Wallet'),
            BottomNavigationBarItem(icon: Icon(Icons.person), label: 'Profile'),
          ],
        ),
      ),
    );
  }
}
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String selectedCountry = 'AFN';
  String selectedOperator = 'Roshan';
  int selectedAmount = 100;
  String phone = '';
  final countries = [
    {'code':'AFN', 'name':'Afghanistan', 'flag':'🇦🇫'},
    {'code':'PKR', 'name':'Pakistan', 'flag':'🇵🇰'},
    {'code':'BDT', 'name':'Bangladesh', 'flag':'🇧🇩'},
    {'code':'INR', 'name':'India', 'flag':'🇮🇳'},
  ];
  final operators = {
    'AFN': ['Roshan', 'Etisalat', 'MTN', 'AWCC', 'Salaam'],
    'PKR': ['Jazz', 'Telenor', 'Zong', 'Ufone'],
    'BDT': ['Grameenphone', 'Robi', 'Banglalink'],
    'INR': ['Jio', 'Airtel', 'Vi', 'BSNL'],
  };
  final amounts = [100, 250, 500, 1000];
  double get price => AppConfig.prices[selectedCountry]?[selectedAmount] ?? 1.64;
  int get bonus => AppConfig.bonuses[selectedCountry]?[selectedAmount] ?? 10;
  double get fee => AppConfig.feeIsPercentage ? price * AppConfig.feePercentage / 100 : AppConfig.fee;
  double get total => price + fee;
  
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(
        backgroundColor: AppColors.bg,
        elevation: 0,
        title: const Text('PGNT ASIAN TOPUP', style: TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold)),
        actions: [
          Container(
            margin: const EdgeInsets.only(right: 16),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
            decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(20), border: Border.all(color: AppColors.gold.withOpacity(0.3))),
            child: const Row(children: [
              Icon(Icons.account_balance_wallet, color: AppColors.gold, size: 16),
              SizedBox(width: 6),
              Text('€24.50', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold)),
            ]),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Select Country', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 12),
            SizedBox(
              height: 80,
              child: ListView.builder(
                scrollDirection: Axis.horizontal,
                itemCount: countries.length,
                itemBuilder: (c,i){
                  final country = countries[i];
                  final isSel = selectedCountry == country['code'];
                  return GestureDetector(
                    onTap: ()=> setState((){
                      selectedCountry = country['code'] as String;
                      selectedOperator = operators[selectedCountry]![0];
                      selectedAmount = 100;
                    }),
                    child: Container(
                      width: 80, margin: const EdgeInsets.only(right: 12),
                      decoration: BoxDecoration(
                        color: isSel ? AppColors.gold : AppColors.card,
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: isSel ? AppColors.gold : AppColors.gold.withOpacity(0.2)),
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text(country['flag'] as String, style: const TextStyle(fontSize: 28)),
                          const SizedBox(height: 4),
                          Text(country['code'] as String, style: TextStyle(color: isSel ? AppColors.bg : AppColors.white, fontWeight: FontWeight.bold, fontSize: 12)),
                        ],
                      ),
                    ),
                  );
                },
              ),
            ),
                        const SizedBox(height: 20),
            const Text('Phone Number', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            TextField(
              style: const TextStyle(color: Colors.white),
              keyboardType: TextInputType.phone,
              decoration: InputDecoration(
                hintText: '07XX XXX XXX',
                hintStyle: const TextStyle(color: AppColors.grey),
                prefixText: '+93 ',
                prefixStyle: const TextStyle(color: AppColors.gold),
                filled: true, fillColor: AppColors.card,
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.gold.withOpacity(0.2))),
                enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide(color: AppColors.gold.withOpacity(0.2))),
              ),
              onChanged: (v)=> phone = v,
            ),
            const SizedBox(height: 20),
            const Text('Operator', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8, runSpacing: 8,
              children: operators[selectedCountry]!.map((op){
                final isSel = selectedOperator == op;
                return GestureDetector(
                  onTap: ()=> setState(()=> selectedOperator = op),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                    decoration: BoxDecoration(
                      color: isSel ? AppColors.gold : AppColors.card,
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: isSel ? AppColors.gold : AppColors.gold.withOpacity(0.2)),
                    ),
                    child: Text(op, style: TextStyle(color: isSel ? AppColors.bg : AppColors.white, fontWeight: FontWeight.bold, fontSize: 13)),
                  ),
                );
              }).toList(),
            ),
            const SizedBox(height: 20),
            const Text('Select Amount - € Euro', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)),
            const SizedBox(height: 8),
            GridView.builder(
              shrinkWrap: true, physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 2, childAspectRatio: 1.6, crossAxisSpacing: 12, mainAxisSpacing: 12),
              itemCount: amounts.length,
              itemBuilder: (c,i){
                final amt = amounts[i];
                final isSel = selectedAmount == amt;
                final b = AppConfig.bonuses[selectedCountry]?[amt] ?? 0;
                return GestureDetector(
                  onTap: ()=> setState(()=> selectedAmount = amt),
                  child: Container(
                    decoration: BoxDecoration(
                      color: isSel ? AppColors.gold : AppColors.card,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: isSel ? AppColors.gold : AppColors.gold.withOpacity(0.2)),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('$amt $selectedCountry', style: TextStyle(color: isSel ? AppColors.bg : AppColors.white, fontWeight: FontWeight.bold, fontSize: 18)),
                        const SizedBox(height: 4),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(color: isSel ? AppColors.bg : AppColors.gold.withOpacity(0.2), borderRadius: BorderRadius.circular(8)),
                          child: Text('+$b Bonus', style: TextStyle(color: isSel ? AppColors.gold : AppColors.gold, fontSize: 12, fontWeight: FontWeight.bold)),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            const SizedBox(height: 20),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16), border: Border.all(color: AppColors.gold.withOpacity(0.3))),
              child: Column(
                children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Amount', style: TextStyle(color: AppColors.grey)), Text('€${price.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.white))]),
                  const SizedBox(height: 8),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('Fee (€${AppConfig.fee})', style: const TextStyle(color: AppColors.grey)), Text('€${fee.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.white))]),
                  const Divider(color: Colors.white12, height: 20),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Total - € Euro', style: TextStyle(color: AppColors.white, fontWeight: FontWeight.bold, fontSize: 16)), Text('€${total.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold, fontSize: 18))]),
                ],
              ),
            ),
                        const SizedBox(height: 20),
            SizedBox(
              width: double.infinity, height: 56,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                onPressed: (){
                  if(phone.isEmpty){ ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Phone required'))); return; }
                  Navigator.push(context, MaterialPageRoute(builder: (_)=> ConfirmScreen(country: selectedCountry, operator: selectedOperator, amount: selectedAmount, phone: phone, price: price, bonus: bonus, fee: fee, total: total)));
                },
                child: Text('Continue - €${total.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.bg, fontWeight: FontWeight.bold, fontSize: 16)),
              ),
            ),
            const SizedBox(height: 10),
            Center(child: Text('€ Euro - Fee = €${AppConfig.fee}', style: const TextStyle(color: AppColors.grey, fontSize: 10))),
          ],
        ),
      ),
    );
  }
}

class ConfirmScreen extends StatelessWidget {
  final String country, operator, phone;
  final int amount, bonus;
  final double price, fee, total;
  const ConfirmScreen({super.key, required this.country, required this.operator, required this.phone, required this.amount, required this.bonus, required this.price, required this.fee, required this.total});
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.bg,
      appBar: AppBar(backgroundColor: AppColors.bg, leading: IconButton(icon: const Icon(Icons.arrow_back, color: Colors.white), onPressed: ()=> Navigator.pop(context)), title: const Text('Confirm - €', style: TextStyle(color: Colors.white))),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(20), border: Border.all(color: AppColors.gold.withOpacity(0.2))),
              child: Column(
                children: [
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Country', style: TextStyle(color: AppColors.grey)), Text(country, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold))]),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Operator', style: TextStyle(color: AppColors.grey)), Text(operator, style: const TextStyle(color: Colors.white))]),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Phone', style: TextStyle(color: AppColors.grey)), Text(phone, style: const TextStyle(color: Colors.white))]),
                  const Divider(color: Colors.white12, height: 24),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Amount', style: TextStyle(color: AppColors.grey)), Text('€${price.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white))]),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Fee - Your profit €', style: TextStyle(color: AppColors.grey)), Text('€${fee.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white))]),
                  const SizedBox(height: 12),
                  Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [const Text('Total Pay €', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold, fontSize: 18)), Text('€${total.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.gold, fontWeight: FontWeight.bold, fontSize: 22))]),
                ],
              ),
            ),
            const Spacer(),
            SizedBox(
              width: double.infinity, height: 56,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))),
                onPressed: ()=> Navigator.push(context, MaterialPageRoute(builder: (_)=> PaymentScreen(total: total, orderId: 'PGNT${DateTime.now().millisecondsSinceEpoch}', country: country, amount: amount, bonus: bonus, phone: phone, operator: operator))),
                child: Text('Pay €${total.toStringAsFixed(2)} - Euro', style: const TextStyle(color: AppColors.bg, fontWeight: FontWeight.bold, fontSize: 18)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
class PaymentScreen extends StatefulWidget {
  final double total; final String orderId, country, phone, operator; final int amount, bonus;
  const PaymentScreen({super.key, required this.total, required this.orderId, required this.country, required this.amount, required this.bonus, required this.phone, required this.operator});
  @override
  State<PaymentScreen> createState() => _PaymentScreenState();
}
class _PaymentScreenState extends State<PaymentScreen> {
  bool loading = false;
  Future<void> _launchStripe() async {
    setState(()=> loading = true);
    try { await Future.delayed(const Duration(seconds: 1)); if(mounted) Navigator.pushReplacement(context, MaterialPageRoute(builder: (_)=> SuccessScreen(orderId: widget.orderId, amount: widget.amount, country: widget.country, bonus: widget.bonus, phone: widget.phone))); } catch(e){ ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e'))); } finally { if(mounted) setState(()=> loading = false); }
  }
  @override
  Widget build(BuildContext context) {
    return Scaffold(backgroundColor: AppColors.bg, appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Payment - € Euro', style: TextStyle(color: Colors.white))), body: Padding(padding: const EdgeInsets.all(16), child: Column(children: [Container(padding: const EdgeInsets.all(20), decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16)), child: Column(children: [const Icon(Icons.credit_card, color: AppColors.gold, size: 48), const SizedBox(height: 12), Text('Pay €${widget.total.toStringAsFixed(2)}', style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)), Text('For ${widget.amount} + ${widget.bonus} ${widget.country} - € Euro', style: const TextStyle(color: AppColors.grey))])), const Spacer(), SizedBox(width: double.infinity, height: 56, child: ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))), onPressed: loading ? null : _launchStripe, child: loading ? const CircularProgressIndicator(color: AppColors.bg) : Text('Pay Now - €${widget.total.toStringAsFixed(2)}', style: const TextStyle(color: AppColors.bg, fontWeight: FontWeight.bold, fontSize: 16))))])) );
  }
}
class SuccessScreen extends StatelessWidget {
  final String orderId, country, phone; final int amount, bonus;
  const SuccessScreen({super.key, required this.orderId, required this.amount, required this.country, required this.bonus, required this.phone});
  @override
  Widget build(BuildContext context) {
    return Scaffold(backgroundColor: AppColors.bg, body: SafeArea(child: Padding(padding: const EdgeInsets.all(24), child: Column(children: [const Spacer(), Container(width: 100, height: 100, decoration: BoxDecoration(color: Colors.green, borderRadius: BorderRadius.circular(50)), child: const Icon(Icons.check, color: Colors.white, size: 60)), const SizedBox(height: 24), const Text('Top-Up Successful! €', style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold)), const SizedBox(height: 8), Text('$amount + $bonus $country sent to $phone', style: const TextStyle(color: AppColors.grey), textAlign: TextAlign.center), const SizedBox(height: 16), Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(12)), child: Text('Order ID: $orderId - € Euro', style: const TextStyle(color: AppColors.gold, fontSize: 12))), const Spacer(), SizedBox(width: double.infinity, height: 56, child: ElevatedButton(style: ElevatedButton.styleFrom(backgroundColor: AppColors.gold, shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16))), onPressed: ()=> Navigator.pushAndRemoveUntil(context, MaterialPageRoute(builder: (_)=> const MainScreen()), (r)=> false), child: const Text('New Top-Up - €', style: TextStyle(color: AppColors.bg, fontWeight: FontWeight.bold))))]))));
  }
}
class HistoryScreen extends StatelessWidget {
  const HistoryScreen({super.key});
  @override
  Widget build(BuildContext context) { return Scaffold(backgroundColor: AppColors.bg, appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('History - €', style: TextStyle(color: Colors.white))), body: const Center(child: Text('No transactions yet - € Euro', style: TextStyle(color: AppColors.grey)))); }
}
class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(backgroundColor: AppColors.bg, appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Wallet - €', style: TextStyle(color: Colors.white))), body: Padding(padding: const EdgeInsets.all(16), child: Column(children: [Container(width: double.infinity, padding: const EdgeInsets.all(24), decoration: BoxDecoration(gradient: const LinearGradient(colors: [AppColors.gold, AppColors.goldLight]), borderRadius: BorderRadius.circular(20)), child: Column(children: [const Text('Balance - € Euro', style: TextStyle(color: AppColors.bg)), const Text('€24.50', style: TextStyle(color: AppColors.bg, fontSize: 36, fontWeight: FontWeight.bold)), const SizedBox(height: 8), Text('Fee profit: €${AppConfig.fee} per topup - €', style: const TextStyle(color: AppColors.bg, fontSize: 12))]))])));
  }
}
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(backgroundColor: AppColors.bg, appBar: AppBar(backgroundColor: AppColors.bg, title: const Text('Profile - €', style: TextStyle(color: Colors.white))), body: ListView(padding: const EdgeInsets.all(16), children: [Container(padding: const EdgeInsets.all(16), decoration: BoxDecoration(color: AppColors.card, borderRadius: BorderRadius.circular(16)), child: Column(children: [ListTile(leading: const Icon(Icons.settings, color: AppColors.gold), title: Text('Fee Control - €${AppConfig.fee} Euro', style: TextStyle(color: Colors.white)), subtitle: const Text('Current: €0.79 - یورو - Edit in AppConfig.fee', style: TextStyle(color: AppColors.grey, fontSize: 12))), const Divider(color: Colors.white12), const ListTile(leading: Icon(Icons.share, color: AppColors.gold), title: Text('Referral - €1.50 Euro', style: TextStyle(color: Colors.white)), subtitle: Text('Earn €1.50 per invite - یورو', style: TextStyle(color: AppColors.grey)))])), const SizedBox(height: 16), Container(padding: const EdgeInsets.all(12), decoration: BoxDecoration(color: AppColors.gold.withOpacity(0.1), borderRadius: BorderRadius.circular(12), border: Border.all(color: AppColors.gold.withOpacity(0.3))), child: const Text('💶 ټول یورو € - ډالر نشته! AppConfig.fee = 0.79 €', style: TextStyle(color: AppColors.gold, fontSize: 12), textAlign: TextAlign.center))]));
  }
}
