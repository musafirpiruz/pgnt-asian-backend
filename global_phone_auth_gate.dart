import 'package:country_picker/country_picker.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;

/// Global customer authentication is deliberately separate from recharge
/// destination selection. Firebase receives an E.164 number (for example
/// +14155552671); the top-up country remains selected inside the app.
const String _authBackendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue: 'https://pgnt-asian-backend.onrender.com',
);

class GlobalPhoneAuthGate extends StatelessWidget {
  // Keep OTP delivery and mandatory sign-in disabled until the final Firebase
  // Console, emulator and staging release gate has been explicitly approved.
  static const bool enabled = false;
  final Widget child;

  const GlobalPhoneAuthGate({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    if (!enabled) return child;
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Scaffold(
            body: Center(child: CircularProgressIndicator()),
          );
        }
        if (snapshot.data != null) return child;
        return const GlobalPhoneSignInScreen();
      },
    );
  }
}

class GlobalPhoneSignInScreen extends StatefulWidget {
  const GlobalPhoneSignInScreen({super.key});

  @override
  State<GlobalPhoneSignInScreen> createState() =>
      _GlobalPhoneSignInScreenState();
}

class _GlobalPhoneSignInScreenState extends State<GlobalPhoneSignInScreen> {
  final _phoneController = TextEditingController();
  final _codeController = TextEditingController();
  Country _country = Country.parse('FR');
  String? _verificationId;
  bool _codeSent = false;
  bool _busy = false;
  String? _error;

  String get _e164Phone {
    final national = _phoneController.text.replaceAll(RegExp(r'[^0-9]'), '');
    return '+${_country.phoneCode}$national';
  }

  @override
  void dispose() {
    _phoneController.dispose();
    _codeController.dispose();
    super.dispose();
  }

  void _chooseCountry() {
    showCountryPicker(
      context: context,
      showPhoneCode: true,
      favorite: const ['FR', 'US', 'GB', 'DE', 'AF', 'PK', 'IN', 'BD'],
      onSelect: (country) => setState(() => _country = country),
    );
  }

  Future<void> _sendCode() async {
    final digits = _phoneController.text.replaceAll(RegExp(r'[^0-9]'), '');
    if (digits.length < 4 || digits.length > 14) {
      setState(() => _error = 'Enter a valid phone number.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await FirebaseAuth.instance.verifyPhoneNumber(
        phoneNumber: _e164Phone,
        timeout: const Duration(seconds: 60),
        verificationCompleted: (credential) async {
          await _completeSignIn(credential);
        },
        verificationFailed: (exception) {
          if (!mounted) return;
          setState(() {
            _busy = false;
            _error = exception.code == 'too-many-requests'
                ? 'Too many attempts. Please try again later.'
                : 'Phone verification could not start. Check the number and try again.';
          });
        },
        codeSent: (verificationId, resendToken) {
          if (!mounted) return;
          setState(() {
            _verificationId = verificationId;
            _codeSent = true;
            _busy = false;
          });
        },
        codeAutoRetrievalTimeout: (verificationId) {
          _verificationId = verificationId;
        },
      );
    } on FirebaseAuthException catch (exception) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = exception.code == 'operation-not-allowed'
            ? 'Phone sign-in is not enabled yet. Please try again later.'
            : 'Could not request a verification code.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Could not request a verification code.';
      });
    }
  }

  Future<void> _verifyCode() async {
    final id = _verificationId;
    final code = _codeController.text.trim();
    if (id == null || code.length < 4) {
      setState(() => _error = 'Enter the verification code.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final credential = PhoneAuthProvider.credential(
        verificationId: id,
        smsCode: code,
      );
      await _completeSignIn(credential);
    } on FirebaseAuthException catch (exception) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = exception.code == 'invalid-verification-code'
            ? 'The verification code is incorrect.'
            : 'Phone verification failed. Please try again.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = 'Phone verification failed. Please try again.';
      });
    }
  }

  Future<void> _completeSignIn(PhoneAuthCredential credential) async {
    final result =
        await FirebaseAuth.instance.signInWithCredential(credential);
    final token = await result.user?.getIdToken(true);
    if (token == null || token.isEmpty) {
      await FirebaseAuth.instance.signOut();
      throw StateError('Firebase did not return an ID token.');
    }

    // The backend must independently verify the Firebase ID token before
    // the app treats this customer as authenticated.
    final response = await http.get(
      Uri.parse('$_authBackendBaseUrl/api/auth/me'),
      headers: {'Authorization': 'Bearer $token'},
    );
    if (response.statusCode != 200) {
      await FirebaseAuth.instance.signOut();
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = response.statusCode == 503
            ? 'Account service is not configured yet. Please try later.'
            : 'Your account could not be verified by the server.';
      });
      return;
    }
    if (!mounted) return;
    setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    const brand = Color(0xFF7A0C10);
    const gold = Color(0xFFD4B896);
    return Scaffold(
      backgroundColor: const Color(0xFFF8F5F0),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Card(
                elevation: 3,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(22),
                  side: const BorderSide(color: gold),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const CircleAvatar(
                        radius: 34,
                        backgroundColor: brand,
                        child: Icon(Icons.public, color: gold, size: 34),
                      ),
                      const SizedBox(height: 18),
                      const Text(
                        'PGNT ASIAN TOPUP',
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          color: brand,
                          fontSize: 21,
                          fontWeight: FontWeight.bold,
                        ),
                      ),
                      const SizedBox(height: 8),
                      const Text(
                        'Sign in with your phone number from any country',
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 22),
                      if (!_codeSent) ...[
                        Row(
                          children: [
                            OutlinedButton(
                              onPressed: _busy ? null : _chooseCountry,
                              child: Text(
                                '${_country.flagEmoji} +${_country.phoneCode}',
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: TextField(
                                controller: _phoneController,
                                keyboardType: TextInputType.phone,
                                decoration: const InputDecoration(
                                  labelText: 'Phone number',
                                  hintText: 'Without country code',
                                  border: OutlineInputBorder(),
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _sendCode,
                            child: const Text('Continue'),
                          ),
                        ),
                      ] else ...[
                        Text(
                          'Enter the code sent to $_e164Phone',
                          textAlign: TextAlign.center,
                        ),
                        const SizedBox(height: 14),
                        TextField(
                          controller: _codeController,
                          keyboardType: TextInputType.number,
                          maxLength: 8,
                          decoration: const InputDecoration(
                            labelText: 'Verification code',
                            border: OutlineInputBorder(),
                          ),
                        ),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton(
                            onPressed: _busy ? null : _verifyCode,
                            child: const Text('Verify and sign in'),
                          ),
                        ),
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () => setState(() {
                                    _codeSent = false;
                                    _verificationId = null;
                                    _codeController.clear();
                                  }),
                          child: const Text('Change phone number'),
                        ),
                      ],
                      if (_busy) ...[
                        const SizedBox(height: 16),
                        const CircularProgressIndicator(),
                      ],
                      if (_error != null) ...[
                        const SizedBox(height: 12),
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.red),
                        ),
                      ],
                      const SizedBox(height: 12),
                      const Text(
                        'Your sign-in number is separate from the country you choose for mobile top-ups.',
                        textAlign: TextAlign.center,
                        style: TextStyle(fontSize: 12, color: Colors.black54),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
