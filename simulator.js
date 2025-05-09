// simulator.js - Main Simulation Logic
// VERSION CORRIGÉE Syntaxe IS + Debug IS décimal + Correctif Bareme 'A' + Canton Fixe GE + LPP Fixe Standard

document.addEventListener('DOMContentLoaded', () => {
    // Références aux éléments UI
    const form = document.getElementById('simulator-form');
    const calculateButton = document.getElementById('calculate-button');
    const resultsSection = document.getElementById('results-section');
    const usfSelect = document.getElementById('usf');
    // const payslipTableBody = document.getElementById('payslip-table').querySelector('tbody'); // Commenté car le tableau n'est plus dans le HTML
    const errorDiv = document.getElementById('calculation-error');
    const taxInfoDiv = document.getElementById('tax-info');
    const taxRateInfoSpan = document.getElementById('tax-rate-info');
    const exchangeRateInfoSpan = document.getElementById('exchange-rate-info');
    const additionalInfoSection = document.getElementById('additional-info-section');

    const fieldIds = ['uec', 'udn', 'uen', 'utp', 'utj', 'ufm', 'usf', 'umr'];

    const FIELD_ERROR_MESSAGES = {
        genericFieldMissing: "Ce champ est requis.",
        udnRequired: "La date de naissance est requise.",
        udnInvalid: "Date de naissance invalide.",
        udnAgeMinimum: "L'âge minimum requis est de 18 ans.",
        mustBeNumber: (label) => `La valeur pour '${label}' doit être un nombre.`,
        mustBeInteger: (label) => `La valeur pour '${label}' doit être un nombre entier.`,
        minValue: (label, min) => `Minimum pour '${label}': ${min}.`,
        maxValue: (label, max) => `Maximum pour '${label}': ${max}.`,
        ufmPositive: "Les frais mensuels doivent être supérieurs ou égaux à 0."
    };

    // Lancer la simulation au clic
    calculateButton.addEventListener('click', runSimulation);

    function clearFieldValidationErrors() {
        fieldIds.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.remove('invalid');
            }
            const errorElement = document.getElementById(`${id}-error`);
            if (errorElement) {
                errorElement.textContent = '';
                errorElement.style.display = 'none';
            }
        });
    }

    function displayFieldValidationError(fieldId, message) {
        const element = document.getElementById(fieldId);
        if (element) {
            element.classList.add('invalid');
        }
        const errorElement = document.getElementById(`${fieldId}-error`);
        if (errorElement) {
            errorElement.textContent = message;
            errorElement.style.display = 'block';
        }
    }

    // Fonction utilitaire pour calculer le CA annuel
    function calculateAnnualTurnover(inputs) {
         const workingDays = CONFIG.J01 - CONFIG.J02;
         return inputs.utj * workingDays * (inputs.utp / 100); // Directly use utj as it's always CHF
    }

    // Fonction principale de simulation (synchrone)
    function runSimulation() {
        clearFieldValidationErrors();
        errorDiv.textContent = '';
        resultsSection.style.display = 'none';
        additionalInfoSection.style.display = 'none';

        const inputs = getInputs();
        if (!inputs) {
            // Les erreurs de champ sont déjà affichées par getInputs via displayFieldValidationError
            // On pourrait ajouter un message global si nécessaire, mais souvent ce n'est pas utile
            // errorDiv.textContent = 'Veuillez corriger les erreurs dans le formulaire.';
            const firstInvalidField = form.querySelector('.invalid');
            if (firstInvalidField) {
                firstInvalidField.focus();
            }
            return;
        }

        try { // Encapsuler le calcul pour attraper les erreurs
            const annualTurnover = calculateAnnualTurnover(inputs);
            if (isNaN(annualTurnover) || annualTurnover <= 0) {
                 throw new Error("Chiffre d'affaires annuel invalide (vérifiez tarif/jours).");
            }

            const userMarginRateDecimal = inputs.umr / 100;
            const tsc = annualTurnover * (1 - userMarginRateDecimal);
            const annualExpenses = inputs.ufm * 12;
            const targetSalaryCost = tsc - annualExpenses;
            // console.log(`Annual Turnover: ${annualTurnover.toFixed(2)}, User Margin: ${(userMarginRateDecimal * 100).toFixed(1)}%, TSC: ${tsc.toFixed(2)}, Annual Expenses: ${annualExpenses.toFixed(2)}, Target Salary Cost: ${targetSalaryCost.toFixed(2)}`);

            if (targetSalaryCost <= 0) {
                 throw new Error(`Frais mensuels (${inputs.ufm} CHF) trop élevés par rapport au chiffre d'affaires disponible après marge.`);
            }

            const { finalSBA, finalDeductions, iterations, converged } = findSBA(targetSalaryCost, inputs);

            if (converged && finalSBA != null && finalDeductions) {
                displayResults(finalSBA, finalDeductions, inputs, annualTurnover, annualExpenses);
                resultsSection.style.display = 'block';
                additionalInfoSection.style.display = 'block';
                // console.log(`Converged in ${iterations} iterations. Final SBA: ${finalSBA.toFixed(2)}, Final Total Cost: ${(finalSBA + finalDeductions.totalEmployerAnnual + annualExpenses).toFixed(2)}`);
            } else {
                 throw new Error(`Le calcul n'a pas convergé après ${iterations} itérations. Essayez un tarif différent ou vérifiez les paramètres.`);
            }
        } catch (error) {
            console.error("Erreur pendant la simulation:", error);
            errorDiv.textContent = `Erreur lors du calcul : ${error.message}`;
            resultsSection.style.display = 'none';
            additionalInfoSection.style.display = 'none';
        }
    }

    // Fonction pour récupérer et valider les inputs (inchangée)
    function getInputs() {
        let isValid = true;
        const data = {};
        // Note: fieldIds est défini globalement dans le scope du DOMContentLoaded
        const numberFields = ['uen', 'utp', 'utj', 'ufm', 'umr'];

        fieldIds.forEach(id => {
            const element = document.getElementById(id);
            if (!element) {
                console.error(`Élément de formulaire ${id} non trouvé!`);
                // Cette erreur est critique pour le développeur, ne devrait pas arriver.
                // On ne peut pas afficher d'erreur de champ si le champ lui-même manque.
                isValid = false; 
                return; 
            }
            
            let value = element.value.trim(); 
            const label = element.previousElementSibling?.textContent || element.name || id;

            // 1. Vérification des champs requis générique
            if (element.required && !value) {
                displayFieldValidationError(id, FIELD_ERROR_MESSAGES.genericFieldMissing);
                isValid = false;
            }

            // 2. Validations spécifiques par champ (seulement si une valeur est présente ou si requis et vide)
            if (id === 'udn') {
                if (value) { 
                    try {
                        const birthDate = new Date(value);
                        // Vérification supplémentaire de la validité de la date entrée par l'utilisateur.
                        // new Date() peut interpréter des formats partiels, donc on vérifie.
                        // Par exemple, si l'utilisateur tape "2023-15-01", birthDate deviendra "2024-03-01".
                        // On s'assure que la date re-formatée correspond à l'entrée pour plus de robustesse.
                        if (isNaN(birthDate.getTime()) || birthDate.toISOString().slice(0,10) !== value) {
                             // Si la date n'est pas valide, la conversion échoue ou ne correspond pas
                            throw new Error('Invalid date format or value');
                        }

                        const today = new Date();
                        let age = today.getFullYear() - birthDate.getFullYear();
                        const m = today.getMonth() - birthDate.getMonth();
                        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                            age--;
                        }
                        data.age = age;

                        if (isNaN(age) || age < 0) { // Normalement couvert par la validation de la date ci-dessus
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.udnInvalid);
                            isValid = false;
                        } else if (age < 18) {
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.udnAgeMinimum);
                            isValid = false;
                        }
                    } catch (e) { // Attrape l'erreur de `new Date()` si format invalide ou notre `throw`
                        displayFieldValidationError(id, FIELD_ERROR_MESSAGES.udnInvalid);
                        isValid = false;
                    }
                } else if (element.required) {
                    // L'erreur "champ requis" a déjà été affichée, on s'assure juste que isValid reste false
                    // et on ne met pas d'autre message pour ne pas écraser le premier.
                     if(isValid) { // Ne devrait pas arriver si genericFieldMissing a bien mis isValid à false
                         displayFieldValidationError(id, FIELD_ERROR_MESSAGES.udnRequired); // Fallback
                         isValid = false;
                     }
                }
            } else if (numberFields.includes(id)) {
                if (value) { 
                    const numValue = parseFloat(value);
                    if (isNaN(numValue)) {
                        displayFieldValidationError(id, FIELD_ERROR_MESSAGES.mustBeNumber(label));
                        isValid = false;
                    } else {
                        const min = parseFloat(element.min);
                        const max = parseFloat(element.max);

                        if (!isNaN(min) && numValue < min) {
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.minValue(label, min));
                            isValid = false;
                        }
                        if (!isNaN(max) && numValue > max) {
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.maxValue(label, max));
                            isValid = false;
                        }
                        if (id === 'uen' && !Number.isInteger(numValue)){ // Doit être un entier
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.mustBeInteger(label));
                            isValid = false;
                        }
                        if (id === 'ufm' && numValue < 0) { // ufm spécifiquement >= 0
                            displayFieldValidationError(id, FIELD_ERROR_MESSAGES.ufmPositive);
                            isValid = false;
                        }
                        
                        if(isValid) data[id] = numValue; // Stocker la valeur numérique seulement si toutes les validations pour ce champ sont passées
                    }
                } else if (element.required) {
                    // Champ numérique requis mais vide. Erreur déjà gérée par "genericFieldMissing".
                    // Assurer que isValid est false.
                    isValid = false;
                }
            }
            
            // 3. Stocker la valeur brute pour les champs non numériques (comme les selects) 
            //    ou si c'est un champ numérique valide mais pas encore stocké (si isValid est toujours true pour ce champ).
            //    On ne stocke que si le champ n'a pas déjà causé une invalidation.
            if (isValid && value && !data.hasOwnProperty(id) && !numberFields.includes(id)) { 
                data[id] = value;
            } else if (isValid && value && numberFields.includes(id) && data.hasOwnProperty(id)){
                // Le nombre a déjà été stocké après parseFloat et validation, on ne fait rien ici.
            } else if (!value && !element.required) {
                // Champ non requis et vide, on ne stocke rien et ce n'est pas une erreur.
                // Si c'est un nombre, on peut vouloir stocker 0 ou null selon la logique métier.
                // Pour l'instant, on ne stocke que les valeurs entrées.
                if(numberFields.includes(id) && element.value === "") { // element.value car value est trim()
                    // Si un champ numérique optionnel est laissé vide, on pourrait le considérer comme 0 par défaut
                    // data[id] = 0; // Décommentez et adaptez si c'est le comportement souhaité
                }
            }
        });

        if (!isValid) {
            return null; 
        }
        
        // Assurer que les données numériques par défaut (ex: uen=0) sont bien dans data si non modifiées mais valides.
        // Cela est important si le calcul en aval s'attend à ces champs.
        fieldIds.forEach(id => {
            if (!data.hasOwnProperty(id)) {
                const element = document.getElementById(id);
                if (element && element.value) { // Si une valeur par défaut est dans le HTML
                    if (numberFields.includes(id)) {
                        const numVal = parseFloat(element.value);
                        if (!isNaN(numVal)) data[id] = numVal;
                    } else {
                        data[id] = element.value;
                    }
                } else if (numberFields.includes(id) && element.defaultValue && !isNaN(parseFloat(element.defaultValue))) {
                    // Cas pour les champs numériques avec defaultValue et qui n'ont pas été touchés
                     data[id] = parseFloat(element.defaultValue);
                } else if (id === 'uen' && !data.hasOwnProperty('uen')) { // Spécifiquement pour uen, s'il n'est pas rempli
                    data.uen = 0; // Valeur par défaut si non rempli
                }
            }
        });

        data.utj_chf = data.utj; 
        return data;
    }

    // Fonction de recherche itérative du SBA (synchrone, inchangée)
    function findSBA(targetSalaryCost, inputs) {
        let lowerBound = 0; let upperBound = targetSalaryCost * 1.2; let sbaGuess = targetSalaryCost * 0.75;
        let finalSBA = null; let finalDeductions = null; let converged = false;
        const maxIterations = 100; let iterations = 0;
        const toleranceValue = Math.abs(targetSalaryCost * CONFIG.RelativeTolerance);
        while (iterations < maxIterations) {
            iterations++;
            const deductions = calculateAllDeductions(sbaGuess, inputs); // Appel synchrone
            const prs = sbaGuess + deductions.totalEmployerAnnual;
            const difference = prs - targetSalaryCost;
            // console.log(`Iter ${iterations}: SBA=${sbaGuess.toFixed(2)}, PRS=${prs.toFixed(2)}, Target=${targetSalaryCost.toFixed(2)}, Diff=${difference.toFixed(2)}`);

            if (Math.abs(difference) <= toleranceValue) { finalSBA = sbaGuess; finalDeductions = deductions; converged = true; break; }
            if (difference < 0) { lowerBound = sbaGuess; } else { upperBound = sbaGuess; }
            if (upperBound <= lowerBound) { console.warn("Bounds crossed."); finalSBA = sbaGuess; finalDeductions = calculateAllDeductions(finalSBA, inputs); converged = Math.abs(difference) <= toleranceValue * 2; break; } // Appel synchrone
            sbaGuess = (lowerBound + upperBound) / 2;
             if (upperBound - lowerBound < 0.001) { console.warn("Bounds too close."); finalSBA = sbaGuess; finalDeductions = calculateAllDeductions(finalSBA, inputs); converged = Math.abs(difference) <= toleranceValue * 1.5; break; } // Appel synchrone
        }
         if (converged && finalSBA != null && !finalDeductions) { finalDeductions = calculateAllDeductions(finalSBA, inputs); } // Appel synchrone
        return { finalSBA, finalDeductions, iterations, converged };
     }

    // Fonction de calcul de toutes les déductions (synchrone, avec correctif syntaxe IS)
    function calculateAllDeductions(sba, inputs) {
        const details = {};
        let totalEmployeeAnnual = 0;
        let totalEmployerAnnual = 0;

        // Calculs Préliminaires LPP
        const lppBaseSalary = Math.min(sba, CONFIG.M01); // Salaire LPP de base, plafonné à M01
        let salaireCoordonne = 0;

        // --- Début Logique LPP (Nouvelle règle pour bas salaires) ---
        const seuilDeclenchementLPP = CONFIG.M03;
        const deductionCoordinationLPP = CONFIG.M02;
        const baseLPPMinimaleFixe = deductionCoordinationLPP - seuilDeclenchementLPP;
        // Le plafond pour appliquer la base LPP minimale fixe est: M02 + (M02 - M03)
        const plafondBasSalairePourBaseFixe = deductionCoordinationLPP + baseLPPMinimaleFixe;

        if (sba >= seuilDeclenchementLPP) { // Uniquement si le salaire atteint le seuil LPP
            if (sba < plafondBasSalairePourBaseFixe) {
                // Cas: sba >= M03 ET sba < (M02 + (M02 - M03))
                // Le salaire coordonné est la base LPP minimale fixe.
                salaireCoordonne = baseLPPMinimaleFixe;
            } else {
                // Cas: sba >= (M02 + (M02 - M03))
                // Le salaire coordonné est le salaire LPP (plafonné à M01) moins la déduction de coordination M02.
                salaireCoordonne = Math.max(0, lppBaseSalary - deductionCoordinationLPP);
            }
        }
        // Si sba < seuilDeclenchementLPP (M03), salaireCoordonne reste à 0 (valeur initiale)
        // --- Fin Logique LPP ---

        let lppEmprRateTRx = 0;
        if (inputs.age >= 18) { // Assurez-vous que inputs.age est bien calculé et disponible
             const applicableRateEntry = CONFIG.TR.slice().reverse().find(tr => inputs.age >= tr.age_start);
             if(applicableRateEntry && inputs.age >= 25) { // Les cotisations d'épargne LPP commencent à 25 ans
                lppEmprRateTRx = applicableRateEntry.rate;
             }
        }

        // Boucle sur les cotisations Txx (inchangée dans sa structure globale)
        Object.values(CONFIG).forEach(item => {
            if (!item || !item.id || !item.id.startsWith('T')) return;
            let base = 0;
            switch(item.baseRule) {
                case 'sba': base = sba; break;
                case 'min(sba, M04)': base = Math.min(sba, CONFIG.M04); break;
                case 'lppCoord': base = (sba >= CONFIG.M03) ? salaireCoordonne : 0; break;
                default: base = sba;
            }
            let actualEmplRate = item.empl || 0;
            let actualEmprRate = item.empr || 0;

            if (item.id === 'T11') { // Gestion T11
                actualEmprRate = lppEmprRateTRx;
                // Force employee rate to 0 for the standard plan (Explicit logic)
                const currentLppPlan = 'Standard'; // Hardcoded for now
                let configEmplRate = 0;
                if (currentLppPlan !== 'Standard') {
                     // This block would apply if other plans were selected
                     // It uses the 'empl' rate defined in config.js for non-standard plans
                     configEmplRate = item.empl || 0; 
                } // For 'Standard' plan, configEmplRate remains 0
                actualEmplRate = configEmplRate; 

                // Removed condition check based on uof, logic handled above
            }
            if (item.id === 'T10') { // Gestion T10
                if (sba > CONFIG.M04) { actualEmplRate = 0; actualEmprRate = 0; }
            }

            const emplAmount = base * actualEmplRate;
            const emprAmount = base * actualEmprRate;
            details[item.id] = { name: item.name, base: base, emplRate: actualEmplRate, emplAmount: emplAmount, emprRate: actualEmprRate, emprAmount: emprAmount };
            totalEmployeeAnnual += emplAmount;
            totalEmployerAnnual += emprAmount;
        }); // Fin de la boucle forEach

        // Ajout Frais LPP Fixes (F01) (inchangé)
        const f01Amount = CONFIG.F01 || 0;
        details['F01'] = { name: "Frais administratifs LPP", base: 0, emplRate: 0, emplAmount: 0, emprRate: 0, emprAmount: f01Amount };
        totalEmployerAnnual += f01Amount;

        // --- Calcul Impôt Source (Bloc revérifié et corrigé pour Barème 'A') ---
        let withholdingTaxAnnual = 0;
        let withholdingTaxRate = 0;
        let withholdingTaxBarème = ''; // Initialisation

        // Condition principale pour l'impôt source
        if (inputs.usf === 'source') { // Accolade { OUVRANTE pour le bloc IS
            const uecLetter = inputs.uec.toUpperCase();
            const numChildren = parseInt(inputs.uen, 10) || 0;

            // Logique de détermination du barème (corrigée)
            if (uecLetter === 'A') {
                withholdingTaxBarème = 'A0'; // Toujours A0 si état civil 'A'
                // console.log(`IS Rule: UEC 'A' -> Bareme A0 (ignoring ${numChildren} children for code).`);
            } else if (uecLetter === 'H') {
                withholdingTaxBarème = `H${numChildren}`; // H + nb enfants
                // console.log(`IS Rule: UEC 'H' -> Bareme H${numChildren}.`);
            } else if (uecLetter === 'B' || uecLetter === 'C') {
                withholdingTaxBarème = `${uecLetter}${numChildren}`; // B ou C + nb enfants
                // console.log(`IS Rule: UEC '${uecLetter}' -> Bareme ${uecLetter}${numChildren}.`);
            } else {
                console.error(`État civil inconnu pour IS: ${inputs.uec}`);
                withholdingTaxBarème = 'A0'; // Fallback simple
            }

            // console.log(`Determined withholding tax bareme: ${withholdingTaxBarème}`);

            // Calcul du taux et du montant (inchangé)
            const monthlyGross = sba / 12;
            withholdingTaxRate = getWithholdingTaxRate("GE", withholdingTaxBarème, monthlyGross); // Appel Synchrone
            withholdingTaxAnnual = sba * withholdingTaxRate;
            // Gérer déduction fixe ici si nécessaire

            // Canton fixed to GE
            details['TAX'] = { name: `Impôt à la source (${withholdingTaxBarème} GE)`, base: sba, emplRate: withholdingTaxRate, emplAmount: withholdingTaxAnnual, emprRate: 0, emprAmount: 0 };
            totalEmployeeAnnual += withholdingTaxAnnual;

        } else { // Accolade { OUVRANTE pour le else (pas d'IS)
            // Cas où l'impôt source n'est PAS sélectionné
            details['TAX'] = { name: "Impôt à la source", base: 0, emplRate: 0, emplAmount: 0, emprRate: 0, emprAmount: 0 };
        } // Accolade } FERMANTE pour le else (pas d'IS)

        // --- Fin Bloc Impôt Source ---


        // Retour des résultats (inchangé)
        return {
            details: details,
            totalEmployeeAnnual: totalEmployeeAnnual,
            totalEmployerAnnual: totalEmployerAnnual,
            withholdingTaxRate: withholdingTaxRate,
            withholdingTaxBarème: withholdingTaxBarème
        };

    } // Accolade } FERMANTE de la fonction calculateAllDeductions

    // Fonction de recherche du taux IS (synchrone, avec arrondi)
    function getWithholdingTaxRate(canton, bareme, monthlyGross) {
        const year = new Date().getFullYear().toString();
        // console.log(`Lookup tax: Year=${year}, Canton=${canton}, Bareme=${bareme}, Income=${monthlyGross.toFixed(5)}`);

        const roundedMonthlyGross = parseFloat(monthlyGross.toFixed(2)); // Arrondi
        // console.log(`Rounded Monthly Gross for lookup: ${roundedMonthlyGross}`);

        if (typeof TAX_DATA === 'undefined') { console.error("TAX_DATA not loaded!"); return 0; }
        const yearData = TAX_DATA[year]; if (!yearData) { console.warn(`Tax data missing for year: ${year}`); return 0; }
        const cantonData = yearData[canton.toUpperCase()]; if (!cantonData) { console.warn(`Tax data missing for canton: ${canton} in ${year}`); return 0; }
        const baremeData = cantonData[bareme.toUpperCase()]; if (!baremeData || !Array.isArray(baremeData)) { console.warn(`Tax data missing/invalid for bareme: ${bareme} in ${canton}, ${year}`); return 0; }

        let foundRate = 0; let bracketFound = false;
        for (const bracket of baremeData) {
            // console.log(`  Comparing ${roundedMonthlyGross} against min=${bracket.min}, max=${bracket.max}`); // DEBUG
            if (roundedMonthlyGross >= bracket.min && roundedMonthlyGross <= bracket.max) { // Comparaison avec arrondi
                foundRate = bracket.rate; bracketFound = true;
                // console.log(`  -> FOUND bracket: min=${bracket.min}, max=${bracket.max}, rate=${foundRate}`); // DEBUG
                break;
            }
        }
        if (!bracketFound) { console.warn(`Income bracket not found for rounded income ${roundedMonthlyGross} in ${year}/${canton}/${bareme}`); }
        return foundRate;
    }

    // Fonction d'affichage des résultats (inchangée)
    function displayResults(sba, deductions, inputs, annualTurnover, annualExpenses) {
        const workingDays = CONFIG.J01 - CONFIG.J02;
        const activityRate = inputs.utp / 100; // Taux d'activité en décimal
        const adjustedWorkingDays = workingDays * activityRate; // Jours de travail ajustés

        const netAnnualBeforeTax = sba - (deductions.totalEmployeeAnnual - (deductions.details['TAX']?.emplAmount || 0));
        const lppSavingAnnual = (deductions.details['T11']?.emplAmount || 0) + (deductions.details['T11']?.emprAmount || 0);
        const payoutAnnual = netAnnualBeforeTax - (deductions.details['TAX']?.emplAmount || 0) + annualExpenses;
        const prsAnnual = sba + deductions.totalEmployerAnnual; const totalCompanyCost = prsAnnual + annualExpenses;
        const actualMargin = (annualTurnover > 0) ? (1 - totalCompanyCost / annualTurnover) : 0;
        const formatCHF = (v) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, "'") : '0.00';
        const formatDaily = (v) => adjustedWorkingDays > 0 && v != null ? formatCHF(v / adjustedWorkingDays) : 'N/A';
        const formatPercent = (v, d = 3) => v != null ? (v * 100).toFixed(d) + '%' : '-';

        document.getElementById('result-sba-annual').textContent = formatCHF(sba); document.getElementById('result-sba-monthly').textContent = formatCHF(sba / 12); document.getElementById('result-sba-daily').textContent = formatDaily(sba);
        document.getElementById('result-net-annual').textContent = formatCHF(netAnnualBeforeTax); document.getElementById('result-net-monthly').textContent = formatCHF(netAnnualBeforeTax / 12); document.getElementById('result-net-daily').textContent = formatDaily(netAnnualBeforeTax);
        document.getElementById('result-lpp-saving-annual').textContent = formatCHF(lppSavingAnnual); document.getElementById('result-lpp-saving-monthly').textContent = formatCHF(lppSavingAnnual / 12); document.getElementById('result-lpp-saving-daily').textContent = formatDaily(lppSavingAnnual);
        document.getElementById('result-ufm-annual').textContent = formatCHF(annualExpenses); document.getElementById('result-ufm-monthly').textContent = formatCHF(inputs.ufm); document.getElementById('result-ufm-daily').textContent = formatDaily(annualExpenses);
        document.getElementById('result-payout-annual').textContent = formatCHF(payoutAnnual); document.getElementById('result-payout-monthly').textContent = formatCHF(payoutAnnual / 12); document.getElementById('result-payout-daily').textContent = formatDaily(payoutAnnual);
        document.getElementById('result-prs-annual').textContent = formatCHF(totalCompanyCost); document.getElementById('result-prs-monthly').textContent = formatCHF(totalCompanyCost / 12); document.getElementById('result-prs-daily').textContent = formatDaily(totalCompanyCost);

        const payoutLabelElement = document.getElementById('label-payout');
        if (inputs.usf === 'resident') {
            payoutLabelElement.textContent = 'Paiement Consultant (avant impôts directs & frais inclus)';
        } else { // 'source' or other cases
            payoutLabelElement.textContent = 'Paiement Consultant (après impôt source & frais inclus)';
        }

        // ---- AJOUT POUR CONGES PAYES ----
        // Utilisation du paramètre CONFIG.J02 pour le nombre de jours de congés
        const paidLeaveDays = (CONFIG.J02 || 0) * (inputs.utp / 100);
        let paidLeaveInfoElement = document.getElementById('paid-leave-info'); // Utiliser un ID spécifique

        if (!paidLeaveInfoElement) {
            paidLeaveInfoElement = document.createElement('div'); // 'div' pour occuper toute la largeur
            paidLeaveInfoElement.id = 'paid-leave-info';
            // taxInfoDiv et taxRateInfoSpan sont récupérés au début du script global DOMContentLoaded.
            if (taxInfoDiv && taxRateInfoSpan) {
                taxInfoDiv.insertBefore(paidLeaveInfoElement, taxRateInfoSpan);
            } else if (taxInfoDiv) { // Fallback: si taxRateInfoSpan n'est pas là (ne devrait pas arriver)
                taxInfoDiv.appendChild(paidLeaveInfoElement); // Ajoute à la fin de taxInfoDiv
            }
        }
        // Formatter le nombre de jours avec un point décimal si nécessaire, et une décimale max.
        paidLeaveInfoElement.textContent = `Congés payés par an: ${paidLeaveDays.toLocaleString('en-US', { maximumFractionDigits: 1 })} jours`;
        // ---- FIN AJOUT POUR CONGES PAYES ----

        taxRateInfoSpan.textContent = ''; 
        if (inputs.usf === 'source' && deductions.withholdingTaxRate > 0) { 
            taxRateInfoSpan.textContent = `Impôts: Barème ${deductions.withholdingTaxBarème} (GE), Taux: ${formatPercent(deductions.withholdingTaxRate)}.`; 
        } else if (inputs.usf === 'source') { 
            taxRateInfoSpan.textContent = `Impôts: Barème ${deductions.withholdingTaxBarème} (GE) - Taux 0%/non trouvé.`; 
        }

        const userMarginPercentage = inputs.umr;
        exchangeRateInfoSpan.textContent = `Marge brute calculée: ${formatPercent(actualMargin, 2)} (Marge Cible: ${userMarginPercentage.toFixed(1)}%)`;

        // Le code pour payslipTableBody a été supprimé car la table n'est plus affichée.
    }

}); // Fin du DOMContentLoaded