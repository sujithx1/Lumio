import 'package:flutter/material.dart';

import '../effects/catalog.dart';
import '../theme/tokens.g.dart';
import 'common.dart';

/// Lets the user choose one effect from the catalog. Resolves to the chosen id, or null if dismissed.
Future<String?> pickEffect(BuildContext context, EffectCatalog catalog, {required String current, String? title}) =>
    showModalBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      builder: (c) => SafeArea(
        child: SizedBox(
          height: MediaQuery.sizeOf(c).height * 0.7,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(LumioSpace.xl, 0, LumioSpace.xl, LumioSpace.md),
                child: Text(
                  title ?? 'Choose an effect',
                  style: Theme.of(c).textTheme.titleLarge?.copyWith(fontWeight: FontWeight.w600),
                ),
              ),
              Expanded(
                child: GridView.builder(
                  padding: const EdgeInsets.fromLTRB(LumioSpace.xl, 0, LumioSpace.xl, LumioSpace.xl),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    mainAxisSpacing: LumioSpace.md,
                    crossAxisSpacing: LumioSpace.md,
                    childAspectRatio: 1.5,
                  ),
                  itemCount: catalog.effects.length,
                  itemBuilder: (_, i) {
                    final e = catalog.effects[i];
                    final selected = e.id == current;
                    return GestureDetector(
                      onTap: () => Navigator.pop(c, e.id),
                      child: Container(
                        clipBehavior: Clip.antiAlias,
                        decoration: BoxDecoration(
                          borderRadius: BorderRadius.circular(LumioRadius.md),
                          border: Border.all(
                            color: selected ? LumioColors.accent : LumioColors.border,
                            width: selected ? 2 : 1,
                          ),
                        ),
                        child: Stack(
                          fit: StackFit.expand,
                          children: [
                            EffectSwatch(effect: e, height: 100),
                            Padding(
                              padding: const EdgeInsets.all(LumioSpace.sm),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                mainAxisAlignment: MainAxisAlignment.end,
                                children: [
                                  Text(
                                    e.name,
                                    style: Theme.of(c).textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600),
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  Text(e.categoryLabel, style: Theme.of(c).textTheme.bodySmall),
                                ],
                              ),
                            ),
                            if (selected)
                              const Positioned(
                                top: 6,
                                right: 6,
                                child: Icon(Icons.check_circle_rounded, color: LumioColors.accent, size: 20),
                              ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
