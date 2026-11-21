//! The trusted effect catalog, compiled into the binary.

use serde::Deserialize;
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectSpec {
    pub id: String,
    pub name: String,
    pub min_duration: u32,
    pub max_duration: u32,
}

#[derive(Deserialize)]
struct CatalogFile {
    effects: Vec<EffectSpec>,
}

const CATALOG_JSON: &str = include_str!("../../../../protocol/effects/catalog.json");

fn catalog() -> &'static HashMap<String, EffectSpec> {
    static CATALOG: OnceLock<HashMap<String, EffectSpec>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let file: CatalogFile = serde_json::from_str(CATALOG_JSON).expect("bundled catalog is valid JSON");
        file.effects.into_iter().map(|e| (e.id.clone(), e)).collect()
    })
}

/// Looks up an effect. Anything not in the bundled catalog is never rendered.
pub fn effect(id: &str) -> Option<&'static EffectSpec> {
    catalog().get(id)
}

/// Clamps a requested duration into the effect's allowed range.
pub fn clamp_duration(spec: &EffectSpec, duration: u32) -> u32 {
    duration.clamp(spec.min_duration, spec.max_duration)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_catalog_has_the_launch_effects() {
        assert_eq!(catalog().len(), 8);
        let portal = effect("cosmic-portal").unwrap();
        assert_eq!(clamp_duration(portal, 100), portal.min_duration);
        assert_eq!(clamp_duration(portal, 99_999), portal.max_duration);
        assert!(effect("rm-rf").is_none());
    }
}
