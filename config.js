// config.js - Configuration Data
// IMPORTANT: Update these values regularly! Contains 2025 LPP values.

const CONFIG = {
    // Days (Jours)
    J01: 252, // Nb jours ouvrables par an
    J02: 25,  // Nb jours de congés par an

    // Margin (Marge)
    R01: 0.07, // Marge brute (7%)
    // D01 renommé en RelativeTolerance
    RelativeTolerance: 0.0005, // Tolérance relative pour le calcul itératif (0.5%)

    // LPP Fees (Frais LPP)
    F01: 300.00, // Frais administratifs LPP (annuel)

    // LPP Rates (Taux LPP Employeur - based on age)
    TR: [ // Sorted by age_start
        { age_start: 18, rate: 0.00 }, // TR1 placeholder
        { age_start: 25, rate: 0.07 }, // TR2
        { age_start: 35, rate: 0.10 }, // TR3
        { age_start: 45, rate: 0.15 }, // TR4
        { age_start: 55, rate: 0.18 }  // TR5
    ],

    // Min/Max Amounts (Montants mini et maxi) - Annual CHF (Valeurs LPP 2025)
    M01: 90720.00,  // Plafond LPP (2025)
    M02: 26460.00,  // Coordination Deduction LPP (2025)
    M03: 22680.00,  // Seuil déclenchement LPP (2025)
    M04: 148200.00, // Plafond AC / LAA - Vérifier si change pour 2025

    // Base Rates (Taux de base) - Annual
    T01: { name: "AVS/AI/APG",         empl: 0.05300, empr: 0.05300, baseRule: 'sba' },
    T02: { name: "Chômage",            empl: 0.01100, empr: 0.01100, baseRule: 'min(sba, M04)' },
    T03: { name: "Allocations familiales", empl: 0.00000, empr: 0.02250, baseRule: 'sba' }, // GE Rate?
    T04: { name: "Maternité (GE)",     empl: 0.00032, empr: 0.00032, baseRule: 'sba' }, // GE Rate?
    T05: { name: "Contribution LSAPE", empl: 0.00000, empr: 0.001350, baseRule: 'sba' },
    T06: { name: "Frais administratifs AVS", empl: 0.00000, empr: 0.00200, baseRule: 'sba' }, // Simplification
    T07: { name: "LAA non professionnelle", empl: 0.00000, empr: 0.00730, baseRule: 'min(sba, M04)' }, // Charge employeur
    T08: { name: "LAA professionnelle",   empl: 0.00000, empr: 0.001092, baseRule: 'min(sba, M04)' }, // Taux corrigé
    T09: { name: "Assurance IJM (APG Maladie)", empl: 0.00000, empr: 0.03660, baseRule: 'min(sba, M04)' }, // Example rate
    T10: { name: "Formation / CCT",    empl: 0.00000, empr: 0.00800, baseRule: 'min(sba, M04)' }, // Taux -> 0 si SBA>M04 (géré in JS)

    // LPP Taux employé de 3% SI l'option N'EST PAS Standard
    T11: { name: "LPP Épargne Complément", empl: 0.03000, empr: 0.00000, baseRule: 'lppCoord', condition: 'uof !== "Standard"' },

    T12: { name: "LPP Risque",         empl: 0.00000, empr: 0.01200, baseRule: 'lppCoord' },

    // Withholding Tax - Placeholder
    WITHHOLDING_TAX: { /* ... (structure existante) ... */ },

     // Exchange Rate - Placeholder
     CHF_EUR_RATE: 1.07481,
};

// Add IDs to CONFIG rates
Object.keys(CONFIG).forEach(key => {
    if (key.startsWith('T') && typeof CONFIG[key] === 'object' && CONFIG[key].name) {
        CONFIG[key].id = key;
    }
});