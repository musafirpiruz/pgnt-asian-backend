import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/foundation.dart';

/// Firebase identifiers for the registered Android app.
/// These values are configuration identifiers, not service-account credentials.
class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return android;
    }
    throw UnsupportedError(
      'PGNT ASIAN TOPUP Firebase is currently configured for Android only.',
    );
  }

  static const FirebaseOptions android = FirebaseOptions(
    apiKey: 'AIzaSyAY8N_k2T3lMEI8val-TnwyKaSo1zV32JM',
    appId: '1:992919566178:android:aaa48096765535712c1e3b',
    messagingSenderId: '992919566178',
    projectId: 'pgnt-asian-topup',
    storageBucket: 'pgnt-asian-topup.firebasestorage.app',
  );
}
