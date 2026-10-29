import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:http/http.dart' as http;

const _authBase = String.fromEnvironment('BACKEND_BASE_URL', defaultValue: 'https://pgnt-asian-backend.onrender.com');
const _authStore = FlutterSecureStorage();
const _authKey = 'pgnt_customer_session_token_v1';

class PhoneAuthScreen extends StatefulWidget {
  final String languageCode;
  const PhoneAuthScreen({super.key, required this.languageCode});
  @override
  State<PhoneAuthScreen> createState() => _PhoneAuthScreenState();
}
class _PhoneAuthScreenState extends State<PhoneAuthScreen> {
  final phone = TextEditingController();
  final code = TextEditingController();
  bool loading = true, sending = false, verifying = false, sent = false;
  String? error, message, accountPhone;
  static const words = <String, Map<String,String>>{
    'ps': {'title':'د موبایل حساب','phone':'نړیوال نمبر، لکه +33612345678','send':'د تایید کوډ واستوئ','code':'د SMS کوډ','verify':'تایید او ننوتل','logout':'له حسابه وتل','signed':'حساب تایید شوی','need':'د خپل حساب لپاره موبایل تایید کړئ','sent':'که شمېره SMS ترلاسه کولی شي، کوډ غوښتل شوی.','bad':'غوښتنه بشپړه نه شوه. وروسته بیا هڅه وکړئ.','invalid':'سم نړیوال نمبر او کوډ ولیکئ.'},
    'fa': {'title':'حساب موبایل','phone':'شماره بین‌المللی، مانند +33612345678','send':'ارسال کد تأیید','code':'کد پیامک','verify':'تأیید و ورود','logout':'خروج از حساب','signed':'حساب تأیید شده','need':'برای حساب، شماره موبایل خود را تأیید کنید','sent':'اگر شماره پیامک دریافت کند، کد درخواست شده است.','bad':'درخواست انجام نشد. بعداً دوباره تلاش کنید.','invalid':'شماره بین‌المللی و کد معتبر وارد کنید.'},
    'en': {'title':'Phone account','phone':'International number, e.g. +33612345678','send':'Send verification code','code':'SMS code','verify':'Verify and sign in','logout':'Sign out','signed':'Phone verified','need':'Verify your phone to access your account','sent':'If this number can receive SMS, a code has been requested.','bad':'Request failed. Please try again later.','invalid':'Enter a valid international number and code.'},
    'ur': {'title':'موبائل اکاؤنٹ','phone':'ملکی کوڈ کے ساتھ نمبر، مثلاً +33612345678','send':'تصدیقی کوڈ بھیجیں','code':'SMS کوڈ','verify':'تصدیق اور سائن اِن','logout':'اکاؤنٹ سے لاگ آؤٹ','signed':'فون کی تصدیق ہوگئی','need':'اکاؤنٹ کے لیے فون کی تصدیق کریں','sent':'اگر نمبر SMS وصول کرسکتا ہے تو کوڈ کی درخواست ہوگئی۔','bad':'درخواست ناکام ہوئی، بعد میں کوشش کریں۔','invalid':'درست بین الاقوامی نمبر اور کوڈ درج کریں۔'},
    'hi': {'title':'फ़ोन खाता','phone':'देश कोड सहित नंबर, जैसे +33612345678','send':'सत्यापन कोड भेजें','code':'SMS कोड','verify':'सत्यापित करें और साइन इन','logout':'खाते से साइन आउट','signed':'फ़ोन सत्यापित है','need':'खाते के लिए फ़ोन सत्यापित करें','sent':'यदि नंबर SMS प्राप्त कर सकता है, तो कोड मांगा गया है।','bad':'अनुरोध विफल हुआ। बाद में प्रयास करें।','invalid':'मान्य अंतरराष्ट्रीय नंबर और कोड दर्ज करें।'},
    'bn': {'title':'ফোন অ্যাকাউন্ট','phone':'দেশের কোডসহ নম্বর, যেমন +33612345678','send':'যাচাইকরণ কোড পাঠান','code':'SMS কোড','verify':'যাচাই করে সাইন ইন','logout':'অ্যাকাউন্ট থেকে সাইন আউট','signed':'ফোন যাচাই করা হয়েছে','need':'অ্যাকাউন্টের জন্য ফোন যাচাই করুন','sent':'নম্বরটি SMS পেতে পারলে কোডের অনুরোধ করা হয়েছে।','bad':'অনুরোধ ব্যর্থ হয়েছে। পরে আবার চেষ্টা করুন।','invalid':'সঠিক আন্তর্জাতিক নম্বর ও কোড দিন।'},
  };
  String t(String key) => words[widget.languageCode]?[key] ?? words['en']![key]!;
  @override
  void initState() { super.initState(); restore(); }
  Future<Map<String,dynamic>> request(String path, {Map<String,String>? body, String? token}) async {
    final uri = Uri.parse(_authBase + path);
    final headers = {'Accept':'application/json', if (body != null) 'Content-Type':'application/json', if (token != null) 'Authorization':'Bearer ' + token};
    final r = body == null ? await http.get(uri, headers: headers).timeout(const Duration(seconds:15)) : await http.post(uri, headers: headers, body: jsonEncode(body)).timeout(const Duration(seconds:15));
    dynamic data; try { data = jsonDecode(r.body); } catch (_) { data = {}; }
    if (r.statusCode < 200 || r.statusCode >= 300) throw Exception(data is Map ? (data['error']?.toString() ?? t('bad')) : t('bad'));
    return data is Map<String,dynamic> ? data : <String,dynamic>{};
  }
  Future<void> restore() async {
    try { final token = await _authStore.read(key:_authKey); if (token != null && token.isNotEmpty) { final d = await request('/api/auth/me', token:token); accountPhone = d['customer']?['phone']?.toString(); } }
    catch (_) { await _authStore.delete(key:_authKey); }
    finally { if (mounted) setState(() => loading = false); }
  }
  Future<void> sendCode() async {
    final p = phone.text.trim();
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(p)) { setState(() => error=t('invalid')); return; }
    setState(() { sending=true; error=null; message=null; });
    try { await request('/api/auth/phone/send', body:{'phone':p}); if (mounted) setState(() { sent=true; message=t('sent'); }); }
    catch(e) { if(mounted) setState(()=>error=e.toString().replaceFirst('Exception: ','')); }
    finally { if(mounted) setState(()=>sending=false); }
  }
  Future<void> verify() async {
    final p=phone.text.trim(), c=code.text.trim();
    if (!RegExp(r'^\+[1-9]\d{7,14}$').hasMatch(p) || !RegExp(r'^\d{4,10}$').hasMatch(c)) { setState(()=>error=t('invalid')); return; }
    setState(()=>{verifying=true,error=null,message=null});
    try { final d=await request('/api/auth/phone/verify',body:{'phone':p,'code':c}); final token=d['token']?.toString()??''; if(token.length<40) throw Exception(t('bad')); await _authStore.write(key:_authKey,value:token); if(mounted)setState(()=>{accountPhone=d['customer']?['phone']?.toString()??p,message=t('signed'),sent=false}); }
    catch(e) { if(mounted)setState(()=>error=e.toString().replaceFirst('Exception: ','')); }
    finally { if(mounted)setState(()=>verifying=false); }
  }
  Future<void> logout() async { final token=await _authStore.read(key:_authKey); try { if(token!=null) await request('/api/auth/logout',body:const {},token:token); } catch (_) {} await _authStore.delete(key:_authKey); if(mounted)setState(()=>{accountPhone=null,sent=false,message=null,error=null}); }
  @override
  void dispose(){phone.dispose();code.dispose();super.dispose();}
  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(title:Text(t('title'))),
    body: loading ? const Center(child:CircularProgressIndicator()) : ListView(padding:const EdgeInsets.all(20),children:[
      const Icon(Icons.verified_user_outlined,size:64,color:Color(0xFFD4B896)),
      const SizedBox(height:12),
      Text(accountPhone==null?t('need'):t('signed')+': '+accountPhone!,textAlign:TextAlign.center,style:const TextStyle(fontSize:18,fontWeight:FontWeight.bold)),
      const SizedBox(height:20),
      if(accountPhone!=null) FilledButton(onPressed:logout,child:Text(t('logout'))) else ...[
        TextField(controller:phone,keyboardType:TextInputType.phone,autofillHints:const [AutofillHints.telephoneNumber],decoration:InputDecoration(labelText:t('phone'),border:const OutlineInputBorder())),
        const SizedBox(height:12),
        FilledButton(onPressed:sending?null:sendCode,child:sending?const CircularProgressIndicator():Text(t('send'))),
        if(sent)...[const SizedBox(height:12),TextField(controller:code,keyboardType:TextInputType.number,autofillHints:const [AutofillHints.oneTimeCode],decoration:InputDecoration(labelText:t('code'),border:const OutlineInputBorder())),const SizedBox(height:12),FilledButton(onPressed:verifying?null:verify,child:verifying?const CircularProgressIndicator():Text(t('verify')))],
      ],
      if(message!=null)...[const SizedBox(height:12),Text(message!,style:const TextStyle(color:Colors.green),textAlign:TextAlign.center)],
      if(error!=null)...[const SizedBox(height:12),Text(error!,style:const TextStyle(color:Colors.red),textAlign:TextAlign.center)],
    ]),
  );
}
