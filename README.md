
name: Build PGNT ASIAN TOPUP APK

on:
  workflow_dispatch:
  push:
    branches:
      - main
    paths:
      - 'main.dart'
      - 'main_FIXED_FINAL.dart'
      - 'lib/**'
      - 'pubspec.yaml'
      - '.github/workflows/build-apk.yml'

permissions:
  contents: read

jobs:
  build:
    name: Build Android APK
    runs-on: ubuntu-latest

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Set up Flutter
        uses: subosito/flutter-action@v2
        with:
          channel: stable
          cache: true

      - name: Select Flutter source
        shell: bash
        run: |
          set -euo pipefail

          mkdir -p lib

          if [ -f "main_FIXED_FINAL.dart" ]; then
            cp main_FIXED_FINAL.dart lib/main.dart
            echo "Using main_FIXED_FINAL.dart"
          elif [ -f "main.dart" ]; then
            cp main.dart lib/main.dart
            echo "Using root main.dart"
          elif [ -f "lib/main.dart" ]; then
            echo "Using existing lib/main.dart"
          else
            echo "ERROR: No Dart entry file found."
            exit 1
          fi

          echo "Selected source:"
          wc -l lib/main.dart
          head -20 lib/main.dart

      - name: Verify project files
        shell: bash
        run: |
          set -euo pipefail

          test -f pubspec.yaml
          test -f lib/main.dart

          if [ ! -d android ]; then
            echo "ERROR: Android project folder is missing."
            exit 1
          fi

      - name: Install dependencies
        run: flutter pub get

      - name: Analyze Dart code
        run: dart analyze lib/main.dart

      - name: Build release APK
        run: |
          flutter build apk --release \
            --dart-define=BACKEND_BASE_URL=https://pgnt-asian-backend.onrender.com

      - name: Verify APK
        run: |
          test -s build/app/outputs/flutter-apk/app-release.apk
          ls -lh build/app/outputs/flutter-apk/app-release.apk

      - name: Upload APK
        uses: actions/upload-artifact@v4
        with:
          name: pgnt-asian-topup-apk
          path: build/app/outputs/flutter-apk/app-release.apk
          if-no-files-found: error
          retention-days: 14
          
