import 'package:flutter/material.dart';

void main() {
  runApp(const PGNTApp());
}

class AppConfig {
  static double bonusPercent = 2.0;
  static double referralPercent = 5.0;
  static double fee = 0.79;

  static int calcBonus(int amt) {
    return ((amt * bonusPercent) / 100).round();
  }

  static const Map<String, List<int>> amounts = {
    'AFN': [100, 250, 500, 1000],
    'PKR': [500, 1000, 2000, 5000],
    'BDT': [200, 500, 1000, 2000],
    'INR': [200, 500, 1000, 2000],
  };

  static const langs = [
    {'code': 'ps', 'name': 'پښتو', 'flag': '🇦🇫'},
    {'code': 'fa', 'name': 'دری', 'flag': '🇦🇫'},
    {'code': 'en', 'name': 'English', 'flag': '🇬🇧'},
    {'code': 'bn', 'name': 'বাংলা', 'flag': '🇧🇩'},
    {'code': 'ur', 'name': 'اردو', 'flag': '🇵🇰'},
    {'code': 'hi', 'name': 'हिन्दी', 'flag': '🇮🇳'},
  ];

  static String currentLang = 'ps';
  static String userName = 'Piruz Hassan Zai';
  static String userEmail = 'piruz@pgnt.com';
  static String userPhone = '07XX XXX XXX';
  static String stripeKey = 'pk_test_123';
  static String dtOneKey = 'dtone_123';
  static String pin = '1234';

  static int totalTx = 1247;
  static double totalRev = 9847.50;
  static int totalUsers = 342;
  static double today = 234.50;

  static List<Map<String, dynamic>> recentTx = [
    {
      'phone': '0701234567',
      'op': 'Roshan',
      'amt': 500,
      'c': 'AFN',
      'bonus': 10,
      'fee': 0.79,
      'time': '2m ago',
      'status': 'Success',
      'via': 'DT One'
    },
  ];
}

class PGNTApp extends StatelessWidget {
  const PGNTApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: const HomeScreen(),
    );
  }
}
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});
  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  String country = 'AFN';
  String op = 'Roshan';
  int amount = 100;
  int index = 0;

  final phoneCtrl = TextEditingController();
  final supportCtrl = TextEditingController();

  final Map<String, List<String>> ops = {
    'AFN': ['Roshan', 'Etisalat', 'MTN'],
    'PKR': ['Jazz', 'Telenor', 'Zong'],
    'BDT': ['Grameen', 'Robi'],
    'INR': ['Jio', 'Airtel'],
  };

  final Map<String, Map<String, String>> prefix = {
    'AFN': {'070': 'Roshan', '077': 'MTN'},
    'PKR': {'030': 'Jazz', '031': 'Zong'},
  };

  @override
  void initState() {
    super.initState();
    phoneCtrl.addListener(() {
      String num = phoneCtrl.text;
      if (num.length >= 3) {
        String pre = num.substring(0, 3);
        var map = prefix[country];
        if (map!= null && map.containsKey(pre)) {
          setState(() {
            op = map[pre]!;
          });
        }
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF1A0505),
      body: _body(),
      bottomNavigationBar: BottomNavigationBar(
        backgroundColor: const Color(0xFF2A0A0A),
        selectedItemColor: const Color(0xFFD4AF37),
        unselectedItemColor: const Color(0xFF8B7355),
        currentIndex: index,
        onTap: (i) {
          setState(() {
            index = i;
          });
        },
        type: BottomNavigationBarType.fixed,
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.dashboard),
            label: 'Dashboard',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.home),
            label: 'Topup',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.support_agent),
            label: 'Support',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.wallet),
            label: 'Wallet',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.person),
            label: 'Profile',
          ),
        ],
      ),
    );
  }

  Widget _body() {
    switch (index) {
      case 0:
        return _dashboard();
      case 1:
        return _home();
      case 2:
        return _support();
      case 3:
        return _wallet();
      case 4:
        return _profile();
      default:
        return _dashboard();
    }
  }
    Widget _dashboard() {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            Text(
              'Bonus ${AppConfig.bonusPercent}% - ستا واک کی',
              style: const TextStyle(
                color: Colors.white,
                fontWeight: FontWeight.bold,
              ),
            ),
            Slider(
              value: AppConfig.bonusPercent,
              min: 0,
              max: 10,
              divisions: 20,
              activeColor: const Color(0xFFD4AF37),
              onChanged: (v) {
                setState(() {
                  AppConfig.bonusPercent = v;
                });
              },
            ),
            Slider(
              value: AppConfig.referralPercent,
              min: 0,
              max: 15,
              divisions: 15,
              activeColor: const Color(0xFFD4AF37),
              onChanged: (v) {
                setState(() {
                  AppConfig.referralPercent = v;
                });
              },
            ),
            Slider(
              value: AppConfig.fee,
              min: 0,
              max: 2,
              divisions: 20,
              activeColor: const Color(0xFFD4AF37),
              onChanged: (v) {
                setState(() {
                  AppConfig.fee = v;
                });
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _home() {
    return SafeArea(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          children: [
            TextField(
              controller: phoneCtrl,
              decoration: InputDecoration(
                hintText: '07XX - AUTO',
                filled: true,
                fillColor: const Color(0xFF2A0A0A),
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(14),
                ),
              ),
              style: const TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 10),
            Wrap(
              children: ops[country]!
                 .map((o) => _opChip(o))
                 .toList(),
            ),
            const SizedBox(height: 10),
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate:
                  const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
              ),
              itemCount: AppConfig.amounts[country]!.length,
              itemBuilder: (context, i) {
                final amt = AppConfig.amounts[country]![i];
                return GestureDetector(
                  onTap: () {
                    setState(() {
                      amount = amt;
                    });
                  },
                  child: Container(
                    margin: const EdgeInsets.all(4),
                    color: amount == amt
                       ? const Color(0xFFD4AF37)
                        : const Color(0xFF2A0A0A),
                    child: Center(
                      child: Text('$amt $country'),
                    ),
                  ),
                );
              },
            ),
            ElevatedButton(
              onPressed: () {
                setState(() {
                  index = 0;
                });
              },
              child: Text(
                'Pay €${AppConfig.fee} - ${AppConfig.bonusPercent}%',
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _opChip(String o) {
    return GestureDetector(
      onTap: () {
        setState(() {
          op = o;
        });
      },
      child: Container(
        padding: const EdgeInsets.all(8),
        margin: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: op == o
             ? const Color(0xFFD4AF37)
              : const Color(0xFF2A0A0A),
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(o),
      ),
    );
  }
    Widget _support() {
    return const SafeArea(
      child: Center(
        child: Text(
          'Support AI - 24/7 - 6 ژبې',
          style: TextStyle(color: Colors.white),
        ),
      ),
    );
  }

  Widget _wallet() {
    return SafeArea(
      child: Center(
        child: Container(
          padding: const EdgeInsets.all(20),
          color: const Color(0xFFD4AF37),
          child: Text(
            'Wallet €24.50 - Bonus ${AppConfig.bonusPercent}% - Fee €${AppConfig.fee}',
            style: const TextStyle(color: Colors.black),
          ),
        ),
      ),
    );
  }

  Widget _profile() {
    return SafeArea(
      child: Column(
        children: [
          Text('Profile - ${AppConfig.userName}'),
          Text('Bonus ${AppConfig.bonusPercent}% - ستا واک کی'),
          Text('Referral ${AppConfig.referralPercent}% - ستا واک کی'),
          Text('Fee €${AppConfig.fee} - ستا واک کی'),
          const Text('Dashboard Wallet Support Stripe DT One Security Auto'),
        ],
      ),
    );
  }
}
