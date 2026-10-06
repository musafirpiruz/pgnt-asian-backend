import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';

void main() {
  runApp(const PgntAsianApp());
}

const primaryRed = Color(0xFF7A0C10);
const darkRed = Color(0xFF4B0508);
const gold = Color(0xFFD4B896);
const brightGold = Color(0xFFFFD700);
const cream = Color(0xFFFFF8E7);
const green = Color(0xFF18A957);

const backendBaseUrl = String.fromEnvironment(
  'BACKEND_BASE_URL',
  defaultValue:
      'https://pgnt-asian-backend.onrender.com',
);

class ServerQuote {
  final double price;
  final double fee;
  final double total;
  final double bonus;
  final String currency;
  final int productId;

  const ServerQuote({
    required this.price,
    required this.fee,
    required this.total,
    required this.bonus,
    required this.currency,
    required this.productId,
  });

  factory ServerQuote.fromJson(
    Map<String, dynamic> json,
  ) {
    final pricing =
        json['pricing'] is Map
            ? Map<String, dynamic>.from(
                json['pricing'] as Map,
              )
            : json;

    final priceCents =
        int.tryParse(
              '${pricing['basePriceCents'] ?? pricing['priceCents'] ?? 0}',
            ) ??
            0;

    final feeCents =
        int.tryParse(
              '${pricing['feeCents'] ?? 0}',
            ) ??
            0;

    final totalCents =
        int.tryParse(
              '${pricing['totalChargeCents'] ?? pricing['chargeCents'] ?? 0}',
            ) ??
            0;

    final bonus =
        double.tryParse(
              '${pricing['bonusPercent'] ?? 0}',
            ) ??
            0;

    final productId =
        int.tryParse(
              '${pricing['productId'] ?? 0}',
            ) ??
            0;

    return ServerQuote(
      price: priceCents / 100,
      fee: feeCents / 100,
      total: totalCents / 100,
      bonus: bonus,
      currency:
          '${pricing['currency'] ?? 'eur'}'
              .toLowerCase(),
      productId: productId,
    );
  }
}

class TopUpRecord {
  final String country;
  final String operator;
  final String phone;
  final String status;
  final String orderId;
  final int amount;
  final double price;
  final double fee;
  final double total;
  final double bonus;
  final DateTime date;

  const TopUpRecord({
    required this.country,
    required this.operator,
    required this.phone,
    required this.status,
    required this.orderId,
    required this.amount,
    required this.price,
    required this.fee,
    required this.total,
    required this.bonus,
    required this.date,
  });
}

class PgntAsianApp extends StatefulWidget {
  const PgntAsianApp({
    super.key,
  });

  @override
  State<PgntAsianApp> createState() =>
      _PgntAsianAppState();
}

class _PgntAsianAppState
    extends State<PgntAsianApp> {
  String language = 'English';

  double wallet = 24.50;

  final List<TopUpRecord> history = [];

  @override
  Widget build(
    BuildContext context,
  ) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'PGNT ASIAN TOPUP',
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor:
            cream,
        colorScheme:
            ColorScheme.fromSeed(
          seedColor: primaryRed,
        ),
        inputDecorationTheme:
            InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(16),
            borderSide:
                const BorderSide(
              color: gold,
            ),
          ),
          enabledBorder:
              OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(16),
            borderSide:
                const BorderSide(
              color: gold,
            ),
          ),
          focusedBorder:
              OutlineInputBorder(
            borderRadius:
                BorderRadius.circular(16),
            borderSide:
                const BorderSide(
              color: primaryRed,
              width: 2,
            ),
          ),
        ),
      ),
      home: HomePage(
        language: language,
        wallet: wallet,
        history: history,
        onLanguage: (value) {
          setState(() {
            language = value;
          });
        },
        onWallet: (value) {
          setState(() {
            wallet = value;
          });
        },
        onHistory: (record) {
          setState(() {
            history.insert(
              0,
              record,
            );
          });
        },
      ),
    );
  }
}
class ConfirmPage extends StatefulWidget {
  final String country;
  final String flag;
  final String operator;
  final String phone;
  final int amount;
  final String currency;
  final double wallet;

  final ValueChanged<TopUpRecord> onHistory;
  final ValueChanged<double> onWallet;

  const ConfirmPage({
    super.key,
    required this.country,
    required this.flag,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.wallet,
    required this.onHistory,
    required this.onWallet,
  });

  @override
  State<ConfirmPage> createState() =>
      _ConfirmPageState();
}

class _ConfirmPageState
    extends State<ConfirmPage> {
  bool loading = true;
  bool paying = false;

  String? error;

  ServerQuote? quote;

  @override
  void initState() {
    super.initState();
    loadQuote();
  }

  Future<void> loadQuote() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final uri = Uri.parse(
        '$backendBaseUrl/api/quote'
        '?country=${Uri.encodeComponent(widget.country)}'
        '&amount=${widget.amount}'
        '&currency=${Uri.encodeComponent(widget.currency)}'
        '&operator=${Uri.encodeComponent(widget.operator)}',
      );

      final response =
          await http.get(uri);

      if (response.statusCode != 200) {
        throw Exception(
          'Server quote failed '
          '(${response.statusCode})',
        );
      }

      final data =
          jsonDecode(response.body);

      if (data is! Map<String, dynamic>) {
        throw Exception(
          'Invalid server response',
        );
      }

      final serverQuote =
          ServerQuote.fromJson(data);

      if (serverQuote.total <= 0) {
        throw Exception(
          'Invalid server total',
        );
      }

      if (!mounted) return;

      setState(() {
        quote = serverQuote;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        loading = false;
        error = e.toString();
      });
    }
  }

  Future<void> startPayment() async {
    final currentQuote = quote;

    if (currentQuote == null) {
      return;
    }

    if (paying) {
      return;
    }

    setState(() {
      paying = true;
      error = null;
    });

    try {
      /*
       * IMPORTANT:
       *
       * Do NOT send AFN/PKR/BDT/INR
       * as Stripe currency.
       *
       * Stripe payment is always requested
       * in EUR on our backend.
       *
       * The backend is the authority for:
       * - product price
       * - fee
       * - bonus
       * - final charge
       */

      final response =
          await http.post(
        Uri.parse(
          '$backendBaseUrl/api/payments/checkout',
        ),
        headers: const {
          'Content-Type':
              'application/json',
        },
        body: jsonEncode({
          'country':
              widget.country,

          'phone':
              widget.phone,

          'amount':
              widget.amount,

          /*
           * User's selected local currency
           * is information for the backend.
           *
           * Stripe currency itself is NOT
           * taken from this value.
           */
          'currency':
              widget.currency,

          'operator':
              widget.operator,

          /*
           * IMPORTANT:
           * Do not send priceCents.
           * Do not send fee.
           * Do not send bonus.
           * Do not send total.
           *
           * Backend calculates these values
           * from the database.
           */
        }),
      );

      final data =
          jsonDecode(response.body);

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        final message =
            data is Map<String, dynamic>
                ? '${data['error'] ?? 'Checkout failed'}'
                : 'Checkout failed';

        throw Exception(message);
      }

      if (data is! Map<String, dynamic>) {
        throw Exception(
          'Invalid checkout response',
        );
      }

      final checkoutUrl =
          data['checkoutUrl'] ??
          data['url'];

      if (checkoutUrl == null ||
          checkoutUrl
              .toString()
              .trim()
              .isEmpty) {
        throw Exception(
          'Stripe checkout URL was not returned',
        );
      }

      final uri =
          Uri.tryParse(
        checkoutUrl.toString(),
      );

      if (uri == null) {
        throw Exception(
          'Invalid Stripe checkout URL',
        );
      }

      final launched =
          await launchUrl(
        uri,
        mode:
            LaunchMode.externalApplication,
      );

      if (!launched) {
        throw Exception(
          'Could not open Stripe Checkout',
        );
      }
    } catch (e) {
      if (!mounted) return;

      setState(() {
        error = e.toString();
        paying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: cream,
      appBar: AppBar(
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
        title: const Text(
          'Confirm Top Up',
          style: TextStyle(
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: loading
          ? const Center(
              child:
                  CircularProgressIndicator(),
            )
          : RefreshIndicator(
              onRefresh: loadQuote,
              child:
                  SingleChildScrollView(
                physics:
                    const AlwaysScrollableScrollPhysics(),
                padding:
                    const EdgeInsets.all(
                  16,
                ),
                child: Column(
                  crossAxisAlignment:
                      CrossAxisAlignment
                          .stretch,
                  children: [
                    _ConfirmCard(
                      flag:
                          widget.flag,
                      country:
                          widget.country,
                      operator:
                          widget.operator,
                      phone:
                          widget.phone,
                      amount:
                          widget.amount,
                      currency:
                          widget.currency,
                    ),

                    const SizedBox(
                      height: 16,
                    ),

                    if (quote != null)
                      _PriceCard(
                        quote: quote!,
                        localCurrency:
                            widget.currency,
                        localAmount:
                            widget.amount,
                      ),

                    const SizedBox(
                      height: 16,
                    ),

                    if (error != null)
                      Container(
                        padding:
                            const EdgeInsets
                                .all(
                          14,
                        ),
                        decoration:
                            BoxDecoration(
                          color: Colors.red
                              .withOpacity(
                            0.08,
                          ),
                          borderRadius:
                              BorderRadius
                                  .circular(
                            14,
                          ),
                          border: Border.all(
                            color: Colors.red
                                .withOpacity(
                              0.35,
                            ),
                          ),
                        ),
                        child: Text(
                          error!,
                          style:
                              const TextStyle(
                            color: Colors.red,
                            fontWeight:
                                FontWeight.w700,
                          ),
                        ),
                      ),

                    if (error != null)
                      const SizedBox(
                        height: 16,
                      ),

                    FilledButton(
                      onPressed:
                          paying
                              ? null
                              : startPayment,
                      style:
                          FilledButton.styleFrom(
                        backgroundColor:
                            primaryRed,
                        foregroundColor:
                            Colors.white,
                        minimumSize:
                            const Size
                                .fromHeight(
                          58,
                        ),
                        shape:
                            RoundedRectangleBorder(
                          borderRadius:
                              BorderRadius
                                  .circular(
                            16,
                          ),
                        ),
                      ),
                      child: paying
                          ? const SizedBox(
                              width: 24,
                              height: 24,
                              child:
                                  CircularProgressIndicator(
                                strokeWidth: 2,
                                color:
                                    Colors.white,
                              ),
                            )
                          : Text(
                              'Pay with Stripe  →',
                              style:
                                  const TextStyle(
                                fontSize: 17,
                                fontWeight:
                                    FontWeight.w900,
                              ),
                            ),
                    ),
                  ],
                ),
              ),
            ),
    );
  }
}

class _ConfirmCard extends StatelessWidget {
  final String flag;
  final String country;
  final String operator;
  final String phone;
  final int amount;
  final String currency;

  const _ConfirmCard({
    required this.flag,
    required this.country,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape:
          RoundedRectangleBorder(
        borderRadius:
            BorderRadius.circular(
          18,
        ),
      ),
      child: Padding(
        padding:
            const EdgeInsets.all(
          18,
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            Text(
              '$flag  $country',
              style:
                  const TextStyle(
                fontSize: 20,
                fontWeight:
                    FontWeight.w900,
              ),
            ),

            const SizedBox(
              height: 14,
            ),

            _InfoRow(
              title: 'Operator',
              value: operator,
            ),

            _InfoRow(
              title: 'Phone',
              value: phone,
            ),

            _InfoRow(
              title: 'Top-up',
              value:
                  '$amount $currency',
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceCard extends StatelessWidget {
  final ServerQuote quote;
  final String localCurrency;
  final int localAmount;

  const _PriceCard({
    required this.quote,
    required this.localCurrency,
    required this.localAmount,
  });

  @override
  Widget build(BuildContext context) {
    return Card(
      elevation: 0,
      color: Colors.white,
      shape:
          RoundedRectangleBorder(
        borderRadius:
            BorderRadius.circular(
          18,
        ),
      ),
      child: Padding(
        padding:
            const EdgeInsets.all(
          18,
        ),
        child: Column(
          children: [
            _InfoRow(
              title:
                  'Top-up amount',
              value:
                  '$localAmount $localCurrency',
            ),

            _InfoRow(
              title:
                  'Product price',
              value:
                  '€${quote.price.toStringAsFixed(2)}',
            ),

            _InfoRow(
              title: 'Fee',
              value:
                  '€${quote.fee.toStringAsFixed(2)}',
            ),

            if (quote.bonus > 0)
              _InfoRow(
                title: 'Bonus',
                value:
                    '${quote.bonus}%',
              ),

            const Divider(
              height: 24,
            ),

            _InfoRow(
              title:
                  'Final Stripe total',
              value:
                  '€${quote.total.toStringAsFixed(2)}',
              bold: true,
            ),

            const SizedBox(
              height: 8,
            ),

            const Text(
              'Stripe payment currency: EUR',
              style: TextStyle(
                color: Colors.black54,
                fontWeight:
                    FontWeight.w600,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final String title;
  final String value;
  final bool bold;

  const _InfoRow({
    required this.title,
    required this.value,
    this.bold = false,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          const EdgeInsets.symmetric(
        vertical: 7,
      ),
      child: Row(
        mainAxisAlignment:
            MainAxisAlignment
                .spaceBetween,
        children: [
          Expanded(
            child: Text(
              title,
              style: const TextStyle(
                color: Colors.black54,
              ),
            ),
          ),
          const SizedBox(
            width: 12,
          ),
          Text(
            value,
            style: TextStyle(
              fontWeight: bold
                  ? FontWeight.w900
                  : FontWeight.w700,
              color: bold
                  ? primaryRed
                  : Colors.black87,
            ),
          ),
        ],
      ),
    );
  }
}
// ============================================================
// PART 3/5 — CONFIRM PAGE + SERVER QUOTE
// ============================================================

class ConfirmPage extends StatefulWidget {
  final String country;
  final String flag;
  final String operator;
  final String phone;
  final int amount;
  final String currency;
  final double wallet;

  final ValueChanged<TopUpRecord> onHistory;
  final ValueChanged<double> onWallet;

  const ConfirmPage({
    super.key,
    required this.country,
    required this.flag,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.wallet,
    required this.onHistory,
    required this.onWallet,
  });

  @override
  State<ConfirmPage> createState() =>
      _ConfirmPageState();
}

class _ConfirmPageState
    extends State<ConfirmPage> {
  bool loading = true;
  bool paying = false;

  String? error;

  ServerQuote? quote;

  @override
  void initState() {
    super.initState();
    loadServerQuote();
  }

  Future<void> loadServerQuote() async {
    setState(() {
      loading = true;
      error = null;
    });

    try {
      final uri = Uri.parse(
        '$backendBaseUrl/api/payments/quote',
      ).replace(
        queryParameters: {
          'country': widget.country,
          'amount':
              widget.amount.toString(),
          'currency':
              widget.currency.toLowerCase(),
          'operator':
              widget.operator,
        },
      );

      final response =
          await http.get(uri).timeout(
        const Duration(seconds: 30),
      );

      final body =
          jsonDecode(response.body);

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          body is Map &&
                  body['error'] != null
              ? body['error'].toString()
              : 'Unable to calculate price',
        );
      }

      if (body is! Map) {
        throw Exception(
          'Invalid server response',
        );
      }

      final serverQuote =
          ServerQuote.fromJson(
        Map<String, dynamic>.from(
          body,
        ),
      );

      if (serverQuote.total <= 0) {
        throw Exception(
          'Server returned an invalid total',
        );
      }

      if (serverQuote.currency
              .toLowerCase() !=
          'eur') {
        throw Exception(
          'Server checkout currency must be EUR',
        );
      }

      if (!mounted) return;

      setState(() {
        quote = serverQuote;
        loading = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        loading = false;
        error = e
            .toString()
            .replaceFirst(
              'Exception: ',
              '',
            );
      });
    }
  }

  Future<void> startCheckout() async {
    final currentQuote = quote;

    if (currentQuote == null) {
      return;
    }

    if (paying) {
      return;
    }

    setState(() {
      paying = true;
      error = null;
    });

    try {
      /*
       * IMPORTANT:
       *
       * We DO NOT send:
       * - price from Flutter
       * - fee from Flutter
       * - bonus from Flutter
       * - total from Flutter
       *
       * The server/database is authoritative.
       *
       * Stripe receives EUR only.
       */

      final uri = Uri.parse(
        '$backendBaseUrl/api/payments/checkout',
      );

      final response =
          await http
              .post(
                uri,
                headers: {
                  'Content-Type':
                      'application/json',
                },
                body: jsonEncode({
                  'country':
                      widget.country,

                  'phone':
                      widget.phone,

                  'amount':
                      widget.amount,

                  'productId':
                      currentQuote.productId,

                  'operator':
                      widget.operator,

                  /*
                   * Stripe-supported checkout
                   * currency used by backend.
                   */
                  'currency': 'eur',
                }),
              )
              .timeout(
            const Duration(seconds: 45),
          );

      final body =
          jsonDecode(response.body);

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          body is Map &&
                  body['error'] != null
              ? body['error'].toString()
              : 'Checkout failed',
        );
      }

      if (body is! Map) {
        throw Exception(
          'Invalid checkout response',
        );
      }

      /*
       * Backend should return the Stripe
       * Checkout URL.
       */
      final checkoutUrl =
          body['url'] ??
              body['checkoutUrl'];

      if (checkoutUrl == null ||
          checkoutUrl
              .toString()
              .trim()
              .isEmpty) {
        throw Exception(
          'Stripe Checkout URL was not returned',
        );
      }

      final checkoutUri =
          Uri.tryParse(
        checkoutUrl.toString(),
      );

      if (checkoutUri == null ||
          !checkoutUri.hasScheme) {
        throw Exception(
          'Invalid Stripe Checkout URL',
        );
      }

      if (!await launchUrl(
        checkoutUri,
        mode:
            LaunchMode.externalApplication,
      )) {
        throw Exception(
          'Unable to open Stripe Checkout',
        );
      }

      if (!mounted) return;

      setState(() {
        paying = false;
      });
    } catch (e) {
      if (!mounted) return;

      setState(() {
        paying = false;
        error = e
            .toString()
            .replaceFirst(
              'Exception: ',
              '',
            );
      });
    }
  }

  Widget money(
    double value,
  ) {
    return Text(
      '€${value.toStringAsFixed(2)}',
      style: const TextStyle(
        fontWeight: FontWeight.w900,
        fontSize: 18,
        color: primaryRed,
      ),
    );
  }

  @override
  Widget build(
    BuildContext context,
  ) {
    final currentQuote = quote;

    return Scaffold(
      backgroundColor: cream,
      appBar: AppBar(
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
        title: const Text(
          'Confirm Top Up',
          style: TextStyle(
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(
          16,
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.stretch,
          children: [
            Container(
              padding:
                  const EdgeInsets.all(18),
              decoration:
                  BoxDecoration(
                color: Colors.white,
                borderRadius:
                    BorderRadius.circular(
                  20,
                ),
                border: Border.all(
                  color: gold,
                ),
              ),
              child: Column(
                children: [
                  Text(
                    widget.flag,
                    style:
                        const TextStyle(
                      fontSize: 48,
                    ),
                  ),
                  const SizedBox(
                    height: 8,
                  ),
                  Text(
                    widget.country,
                    style:
                        const TextStyle(
                      fontSize: 20,
                      fontWeight:
                          FontWeight.w900,
                    ),
                  ),
                  const SizedBox(
                    height: 4,
                  ),
                  Text(
                    widget.operator,
                  ),
                  const SizedBox(
                    height: 4,
                  ),
                  Text(
                    widget.phone,
                    style:
                        const TextStyle(
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(
              height: 16,
            ),

            Container(
              padding:
                  const EdgeInsets.all(18),
              decoration:
                  BoxDecoration(
                color: Colors.white,
                borderRadius:
                    BorderRadius.circular(
                  20,
                ),
              ),
              child: loading
                  ? const Column(
                      children: [
                        CircularProgressIndicator(
                          color: primaryRed,
                        ),
                        SizedBox(
                          height: 14,
                        ),
                        Text(
                          'Calculating price from server...',
                        ),
                      ],
                    )
                  : currentQuote == null
                      ? Text(
                          error ??
                              'Price unavailable',
                          style:
                              const TextStyle(
                            color:
                                Colors.red,
                            fontWeight:
                                FontWeight.w700,
                          ),
                        )
                      : Column(
                          children: [
                            _PriceRow(
                              title:
                                  'Top-up',
                              value:
                                  '${widget.amount} ${widget.currency}',
                            ),
                            const Divider(),

                            _PriceRow(
                              title:
                                  'Product Price',
                              trailing:
                                  money(
                                currentQuote
                                    .price,
                              ),
                            ),

                            const SizedBox(
                              height: 8,
                            ),

                            _PriceRow(
                              title:
                                  'Fee',
                              trailing:
                                  money(
                                currentQuote
                                    .fee,
                              ),
                            ),

                            const Divider(),

                            _PriceRow(
                              title:
                                  'Final Total',
                              trailing:
                                  Text(
                                '€${currentQuote.total.toStringAsFixed(2)}',
                                style:
                                    const TextStyle(
                                  fontSize: 22,
                                  fontWeight:
                                      FontWeight.w900,
                                  color:
                                      primaryRed,
                                ),
                              ),
                            ),

                            const SizedBox(
                              height: 12,
                            ),

                            Container(
                              width:
                                  double.infinity,
                              padding:
                                  const EdgeInsets
                                      .all(
                                12,
                              ),
                              decoration:
                                  BoxDecoration(
                                color:
                                    const Color(
                                  0xFFFFF3CD,
                                ),
                                borderRadius:
                                    BorderRadius
                                        .circular(
                                  12,
                                ),
                              ),
                              child:
                                  Text(
                                'Bonus: ${currentQuote.bonus}%',
                                textAlign:
                                    TextAlign
                                        .center,
                                style:
                                    const TextStyle(
                                  fontWeight:
                                      FontWeight
                                          .w900,
                                ),
                              ),
                            ),
                          ],
                        ),
            ),

            if (error != null &&
                !loading) ...[
              const SizedBox(
                height: 14,
              ),
              Container(
                padding:
                    const EdgeInsets.all(
                  12,
                ),
                decoration:
                    BoxDecoration(
                  color: Colors.red
                      .withOpacity(
                    0.08,
                  ),
                  borderRadius:
                      BorderRadius.circular(
                    12,
                  ),
                ),
                child: Text(
                  error!,
                  style:
                      const TextStyle(
                    color: Colors.red,
                    fontWeight:
                        FontWeight.w700,
                  ),
                ),
              ),
            ],

            const SizedBox(
              height: 20,
            ),

            FilledButton(
              onPressed:
                  loading ||
                          currentQuote ==
                              null ||
                          paying
                      ? null
                      : startCheckout,
              style:
                  FilledButton.styleFrom(
                backgroundColor:
                    primaryRed,
                foregroundColor:
                    Colors.white,
                minimumSize:
                    const Size.fromHeight(
                  58,
                ),
                shape:
                    RoundedRectangleBorder(
                  borderRadius:
                      BorderRadius.circular(
                    16,
                  ),
                ),
              ),
              child: paying
                  ? const SizedBox(
                      width: 24,
                      height: 24,
                      child:
                          CircularProgressIndicator(
                        strokeWidth: 2,
                        color:
                            Colors.white,
                      ),
                    )
                  : const Text(
                      'Pay with Stripe',
                      style: TextStyle(
                        fontSize: 18,
                        fontWeight:
                            FontWeight.w900,
                      ),
                    ),
            ),

            const SizedBox(
              height: 10,
            ),

            const Text(
              'Payment is processed securely by Stripe in EUR.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.black54,
                fontSize: 12,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PriceRow extends StatelessWidget {
  final String title;
  final String? value;
  final Widget? trailing;

  const _PriceRow({
    required this.title,
    this.value,
    this.trailing,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Row(
      mainAxisAlignment:
          MainAxisAlignment.spaceBetween,
      children: [
        Text(
          title,
          style: const TextStyle(
            fontWeight: FontWeight.w700,
          ),
        ),
        trailing ??
            Text(
              value ?? '',
              style: const TextStyle(
                fontWeight: FontWeight.w900,
              ),
            ),
      ],
    );
  }
}
// ============================================================
// PART 4/5 — CHECKOUT + PAYMENT RESULT
// ============================================================

class ConfirmPage extends StatefulWidget {
  final String country;
  final String flag;
  final String operator;
  final String phone;
  final int amount;
  final String currency;
  final double wallet;

  final ValueChanged<TopUpRecord> onHistory;
  final ValueChanged<double> onWallet;

  const ConfirmPage({
    super.key,
    required this.country,
    required this.flag,
    required this.operator,
    required this.phone,
    required this.amount,
    required this.currency,
    required this.wallet,
    required this.onHistory,
    required this.onWallet,
  });

  @override
  State<ConfirmPage> createState() =>
      _ConfirmPageState();
}

class _ConfirmPageState
    extends State<ConfirmPage> {
  bool loading = true;
  bool paying = false;

  String? errorMessage;

  ServerQuote? quote;

  @override
  void initState() {
    super.initState();
    loadServerQuote();
  }

  Future<void> loadServerQuote() async {
    setState(() {
      loading = true;
      errorMessage = null;
    });

    try {
      final uri = Uri.parse(
        '$backendBaseUrl/api/quote'
        '?country=${Uri.encodeComponent(widget.country)}'
        '&amount=${widget.amount}'
        '&currency=${Uri.encodeComponent(widget.currency)}'
        '&operator=${Uri.encodeComponent(widget.operator)}',
      );

      final response = await http
          .get(uri)
          .timeout(
            const Duration(seconds: 30),
          );

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          'Server quote failed '
          '(${response.statusCode})',
        );
      }

      final data =
          jsonDecode(response.body);

      if (data is! Map<String, dynamic>) {
        throw Exception(
          'Invalid server response',
        );
      }

      final serverQuote =
          ServerQuote.fromJson(data);

      if (serverQuote.total <= 0) {
        throw Exception(
          'Invalid server total',
        );
      }

      if (serverQuote.currency !=
          'EUR') {
        throw Exception(
          'Server must return EUR for Stripe',
        );
      }

      if (!mounted) return;

      setState(() {
        quote = serverQuote;
        loading = false;
      });
    } catch (error) {
      if (!mounted) return;

      setState(() {
        loading = false;
        errorMessage =
            error.toString();
      });
    }
  }

  Future<void> startCheckout() async {
    final currentQuote = quote;

    if (currentQuote == null) {
      return;
    }

    if (paying) {
      return;
    }

    setState(() {
      paying = true;
      errorMessage = null;
    });

    try {
      /*
       * IMPORTANT:
       *
       * We DO NOT send AFN/PKR/BDT/INR
       * as Stripe currency.
       *
       * The backend is responsible for
       * the final EUR amount.
       *
       * Flutter only sends the order
       * information.
       */

      final response = await http
          .post(
            Uri.parse(
              '$backendBaseUrl/api/payments/checkout',
            ),
            headers: {
              'Content-Type':
                  'application/json',
            },
            body: jsonEncode({
              'country':
                  widget.country,

              'phone':
                  widget.phone,

              'amount':
                  widget.amount,

              'productId':
                  currentQuote.productId,

              'operator':
                  widget.operator,
            }),
          )
          .timeout(
            const Duration(seconds: 45),
          );

      Map<String, dynamic> data = {};

      try {
        final decoded =
            jsonDecode(response.body);

        if (decoded
            is Map<String, dynamic>) {
          data = decoded;
        }
      } catch (_) {}

      if (response.statusCode < 200 ||
          response.statusCode >= 300) {
        throw Exception(
          data['error']?.toString() ??
              'Checkout failed '
                  '(${response.statusCode})',
        );
      }

      final checkoutUrl =
          data['url']?.toString() ??
              data['checkoutUrl']
                  ?.toString();

      if (checkoutUrl == null ||
          checkoutUrl.isEmpty) {
        throw Exception(
          'Checkout URL was not returned by server',
        );
      }

      final uri =
          Uri.tryParse(checkoutUrl);

      if (uri == null ||
          !uri.hasScheme) {
        throw Exception(
          'Invalid checkout URL',
        );
      }

      final opened =
          await launchUrl(
        uri,
        mode:
            LaunchMode.externalApplication,
      );

      if (!opened) {
        throw Exception(
          'Could not open Stripe Checkout',
        );
      }
    } catch (error) {
      if (!mounted) return;

      setState(() {
        errorMessage =
            error.toString();
      });

      ScaffoldMessenger.of(context)
          .showSnackBar(
        SnackBar(
          content: Text(
            error
                .toString()
                .replaceFirst(
                  'Exception: ',
                  '',
                ),
          ),
        ),
      );
    } finally {
      if (!mounted) return;

      setState(() {
        paying = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: cream,
      appBar: AppBar(
        backgroundColor: primaryRed,
        foregroundColor: Colors.white,
        title: const Text(
          'Confirm Top Up',
          style: TextStyle(
            fontWeight: FontWeight.w900,
          ),
        ),
      ),
      body: loading
          ? const Center(
              child:
                  CircularProgressIndicator(),
            )
          : SingleChildScrollView(
              padding:
                  const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment
                        .stretch,
                children: [
                  _ConfirmHeader(
                    flag: widget.flag,
                    country:
                        widget.country,
                  ),

                  const SizedBox(
                    height: 18,
                  ),

                  _InfoCard(
                    title: 'Mobile Number',
                    value: widget.phone,
                    icon:
                        Icons.phone_android,
                  ),

                  const SizedBox(
                    height: 10,
                  ),

                  _InfoCard(
                    title: 'Operator',
                    value:
                        widget.operator,
                    icon:
                        Icons.sim_card,
                  ),

                  const SizedBox(
                    height: 10,
                  ),

                  _InfoCard(
                    title: 'Top Up',
                    value:
                        '${widget.amount} ${widget.currency}',
                    icon:
                        Icons
                            .phone_iphone,
                  ),

                  const SizedBox(
                    height: 20,
                  ),

                  if (quote != null)
                    _PriceCard(
                      quote: quote!,
                    ),

                  const SizedBox(
                    height: 18,
                  ),

                  Container(
                    padding:
                        const EdgeInsets.all(
                      16,
                    ),
                    decoration:
                        BoxDecoration(
                      color:
                          Colors.white,
                      borderRadius:
                          BorderRadius
                              .circular(
                        18,
                      ),
                      border:
                          Border.all(
                        color: gold,
                      ),
                    ),
                    child: const Row(
                      crossAxisAlignment:
                          CrossAxisAlignment
                              .start,
                      children: [
                        Icon(
                          Icons
                              .verified_user,
                          color: green,
                        ),
                        SizedBox(
                          width: 10,
                        ),
                        Expanded(
                          child: Text(
                            'Price, fee and bonus are controlled by the server. '
                            'Stripe receives the final amount in EUR.',
                            style:
                                TextStyle(
                              fontWeight:
                                  FontWeight.w600,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),

                  if (errorMessage !=
                      null) ...[
                    const SizedBox(
                      height: 16,
                    ),
                    Container(
                      padding:
                          const EdgeInsets
                              .all(
                        14,
                      ),
                      decoration:
                          BoxDecoration(
                        color: Colors
                            .red
                            .withOpacity(
                          0.08,
                        ),
                        borderRadius:
                            BorderRadius
                                .circular(
                          14,
                        ),
                        border:
                            Border.all(
                          color:
                              Colors.red,
                        ),
                      ),
                      child: Text(
                        errorMessage!,
                        style:
                            const TextStyle(
                          color:
                              Colors.red,
                          fontWeight:
                              FontWeight
                                  .w600,
                        ),
                      ),
                    ),
                  ],

                  const SizedBox(
                    height: 22,
                  ),

                  FilledButton.icon(
                    onPressed:
                        paying
                            ? null
                            : startCheckout,
                    icon: paying
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child:
                                CircularProgressIndicator(
                              strokeWidth:
                                  2,
                              color: Colors
                                  .white,
                            ),
                          )
                        : const Icon(
                            Icons
                                .lock_outline,
                          ),
                    label: Text(
                      paying
                          ? 'Opening Stripe...'
                          : 'Pay Securely with Stripe',
                    ),
                    style:
                        FilledButton.styleFrom(
                      backgroundColor:
                          primaryRed,
                      foregroundColor:
                          Colors.white,
                      minimumSize:
                          const Size
                              .fromHeight(
                        58,
                      ),
                      shape:
                          RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius
                                .circular(
                          16,
                        ),
                      ),
                    ),
                  ),

                  const SizedBox(
                    height: 12,
                  ),

                  OutlinedButton(
                    onPressed: paying
                        ? null
                        : () =>
                            Navigator.pop(
                              context,
                            ),
                    style:
                        OutlinedButton
                            .styleFrom(
                      minimumSize:
                          const Size
                              .fromHeight(
                        52,
                      ),
                    ),
                    child:
                        const Text(
                      'Back',
                    ),
                  ),
                ],
              ),
            ),
    );
  }
}

class _ConfirmHeader
    extends StatelessWidget {
  final String flag;
  final String country;

  const _ConfirmHeader({
    required this.flag,
    required this.country,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Container(
      padding:
          const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient:
            const LinearGradient(
          colors: [
            primaryRed,
            darkRed,
          ],
        ),
        borderRadius:
            BorderRadius.circular(
          20,
        ),
      ),
      child: Row(
        children: [
          Text(
            flag,
            style:
                const TextStyle(
              fontSize: 38,
            ),
          ),
          const SizedBox(
            width: 14,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment
                      .start,
              children: [
                const Text(
                  'Confirm Top Up',
                  style:
                      TextStyle(
                    color:
                        Colors.white,
                    fontSize: 20,
                    fontWeight:
                        FontWeight.w900,
                  ),
                ),
                const SizedBox(
                  height: 4,
                ),
                Text(
                  country,
                  style:
                      const TextStyle(
                    color:
                        Colors.white70,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _InfoCard
    extends StatelessWidget {
  final String title;
  final String value;
  final IconData icon;

  const _InfoCard({
    required this.title,
    required this.value,
    required this.icon,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Container(
      padding:
          const EdgeInsets.all(15),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius:
            BorderRadius.circular(
          16,
        ),
        border: Border.all(
          color: gold,
        ),
      ),
      child: Row(
        children: [
          Icon(
            icon,
            color: primaryRed,
          ),
          const SizedBox(
            width: 12,
          ),
          Expanded(
            child: Column(
              crossAxisAlignment:
                  CrossAxisAlignment
                      .start,
              children: [
                Text(
                  title,
                  style:
                      const TextStyle(
                    color:
                        Colors.grey,
                    fontSize: 12,
                  ),
                ),
                const SizedBox(
                  height: 3,
                ),
                Text(
                  value,
                  style:
                      const TextStyle(
                    fontWeight:
                        FontWeight.w800,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceCard
    extends StatelessWidget {
  final ServerQuote quote;

  const _PriceCard({
    required this.quote,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Container(
      padding:
          const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius:
            BorderRadius.circular(
          20,
        ),
        border: Border.all(
          color: gold,
          width: 1.5,
        ),
      ),
      child: Column(
        children: [
          const Text(
            'Payment Summary',
            style: TextStyle(
              fontSize: 18,
              fontWeight:
                  FontWeight.w900,
              color: primaryRed,
            ),
          ),

          const SizedBox(
            height: 14,
          ),

          _PriceRow(
            title: 'Product Price',
            value:
                '€${quote.price.toStringAsFixed(2)}',
          ),

          const SizedBox(
            height: 8,
          ),

          _PriceRow(
            title: 'Fee',
            value:
                '€${quote.fee.toStringAsFixed(2)}',
          ),

          const Divider(
            height: 24,
          ),

          _PriceRow(
            title: 'Total',
            value:
                '€${quote.total.toStringAsFixed(2)}',
            bold: true,
          ),

          if (quote.bonus > 0) ...[
            const SizedBox(
              height: 12,
            ),
            Container(
              width:
                  double.infinity,
              padding:
                  const EdgeInsets
                      .symmetric(
                vertical: 10,
                horizontal: 12,
              ),
              decoration:
                  BoxDecoration(
                color:
                    Colors.green
                        .withOpacity(
                  0.08,
                ),
                borderRadius:
                    BorderRadius.circular(
                  12,
                ),
              ),
              child: Text(
                'Bonus: ${quote.bonus}%',
                textAlign:
                    TextAlign.center,
                style:
                    const TextStyle(
                  color: green,
                  fontWeight:
                      FontWeight.w800,
                ),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _PriceRow
    extends StatelessWidget {
  final String title;
  final String value;
  final bool bold;

  const _PriceRow({
    required this.title,
    required this.value,
    this.bold = false,
  });

  @override
  Widget build(
    BuildContext context,
  ) {
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            style: TextStyle(
              fontWeight:
                  bold
                      ? FontWeight.w900
                      : FontWeight.w500,
              fontSize:
                  bold ? 17 : 14,
            ),
          ),
        ),
        Text(
          value,
          style: TextStyle(
            fontWeight:
                FontWeight.w900,
            fontSize:
                bold ? 19 : 15,
            color:
                bold
                    ? primaryRed
                    : Colors.black87,
          ),
        ),
      ],
    );
  }
}
class _VipHeader extends StatelessWidget {
  const _VipHeader();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [
            darkRed,
            primaryRed,
          ],
        ),
        borderRadius:
            BorderRadius.circular(20),
        boxShadow: const [
          BoxShadow(
            blurRadius: 12,
            offset: Offset(0, 6),
            color: Colors.black26,
          ),
        ],
      ),
      child: const Column(
        children: [
          Text(
            'PGNT ASIAN',
            style: TextStyle(
              color: brightGold,
              fontSize: 27,
              fontWeight: FontWeight.w900,
              letterSpacing: 1.2,
            ),
          ),
          SizedBox(height: 4),
          Text(
            'TOPUP',
            style: TextStyle(
              color: Colors.white,
              fontSize: 15,
              fontWeight: FontWeight.w700,
              letterSpacing: 3,
            ),
          ),
        ],
      ),
    );
  }
}

class _WalletCard extends StatelessWidget {
  final double balance;
  final VoidCallback onTap;

  const _WalletCard({
    required this.balance,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius:
          BorderRadius.circular(18),
      child: Container(
        padding:
            const EdgeInsets.all(18),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius:
              BorderRadius.circular(18),
          border: Border.all(
            color: gold,
            width: 1.2,
          ),
        ),
        child: Row(
          children: [
            Container(
              padding:
                  const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: primaryRed
                    .withOpacity(.08),
                shape: BoxShape.circle,
              ),
              child: const Icon(
                Icons
                    .account_balance_wallet,
                color: primaryRed,
              ),
            ),
            const SizedBox(width: 14),
            const Expanded(
              child: Column(
                crossAxisAlignment:
                    CrossAxisAlignment.start,
                children: [
                  Text(
                    'Wallet Balance',
                    style: TextStyle(
                      fontWeight:
                          FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Available balance',
                    style: TextStyle(
                      color:
                          Colors.black54,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            Text(
              '€${balance.toStringAsFixed(2)}',
              style: const TextStyle(
                color: primaryRed,
                fontSize: 20,
                fontWeight:
                    FontWeight.w900,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Title extends StatelessWidget {
  final String text;

  const _Title(this.text);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding:
          const EdgeInsets.only(bottom: 8),
      child: Text(
        text,
        style: const TextStyle(
          color: darkRed,
          fontSize: 16,
          fontWeight: FontWeight.w900,
        ),
      ),
    );
  }
}

class _AmountButton extends StatelessWidget {
  final int amount;
  final String currency;
  final bool selected;
  final int bonus;
  final VoidCallback onTap;

  const _AmountButton({
    required this.amount,
    required this.currency,
    required this.selected,
    required this.bonus,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius:
          BorderRadius.circular(14),
      child: Container(
        width: 155,
        padding:
            const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: selected
              ? primaryRed
              : Colors.white,
          borderRadius:
              BorderRadius.circular(14),
          border: Border.all(
            color: selected
                ? primaryRed
                : gold,
            width: 1.2,
          ),
        ),
        child: Column(
          crossAxisAlignment:
              CrossAxisAlignment.start,
          children: [
            Text(
              '$amount $currency',
              style: TextStyle(
                color: selected
                    ? Colors.white
                    : darkRed,
                fontSize: 17,
                fontWeight:
                    FontWeight.w900,
              ),
            ),
            const SizedBox(height: 5),
            Text(
              bonus > 0
                  ? '+$bonus bonus'
                  : 'Price calculated by server',
              style: TextStyle(
                color: selected
                    ? Colors.white70
                    : Colors.black54,
                fontSize: 11,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ServerPriceNotice
    extends StatelessWidget {
  const _ServerPriceNotice();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding:
          const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius:
            BorderRadius.circular(16),
        border: Border.all(
          color: gold,
        ),
      ),
      child: const Row(
        children: [
          Icon(
            Icons.lock_outline,
            color: primaryRed,
          ),
          SizedBox(width: 10),
          Expanded(
            child: Text(
              'Price, fee and bonus are calculated securely by the server.',
              style: TextStyle(
                fontSize: 12,
                fontWeight:
                    FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/*
============================================================
END OF MAIN.DART
============================================================
*/
