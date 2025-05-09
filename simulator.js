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

    // Lancer la simulation au clic
    calculateButton.addEventListener('click', runSimulation);

    // Fonction utilitaire pour calculer le CA annuel
    function calculateAnnualTurnover(inputs) {
         const workingDays = CONFIG.J01 - CONFIG.J02;
         return inputs.utj * workingDays * (inputs.utp / 100); // Directly use utj as it's always CHF
    }

    // Fonction principale de simulation (synchrone)
    function runSimulation() {
        // Reset UI
        errorDiv.textContent = '';
        resultsSection.style.display = 'none';
        additionalInfoSection.style.display = 'none';

        const inputs = getInputs();
        if (!inputs) {
            errorDiv.textContent = 'Veuillez corriger les erreurs dans le formulaire.';
            return;
        }

        try { // Encapsuler le calcul pour attraper les erreurs
            const annualTurnover = calculateAnnualTurnover(inputs);
            if (isNaN(annualTurnover) || annualTurnover <= 0) {
                 throw new Error("Chiffre d'affaires annuel invalide (vérifiez tarif/jours).");
            }

            // Recherche itérative du SBA (synchrone)
            // Pass user margin to findSBA if needed, or use it directly here
            const userMarginRateDecimal = inputs.umr / 100; // Convert percentage to decimal
            const tsc = annualTurnover * (1 - userMarginRateDecimal); // Use user margin
            const annualExpenses = inputs.ufm * 12; // Frais annuels
            const targetSalaryCost = tsc - annualExpenses; // Cible pour (SBA + Charges Patronales)
            console.log(`Annual Turnover: ${annualTurnover.toFixed(2)}, User Margin: ${(userMarginRateDecimal * 100).toFixed(1)}%, TSC: ${tsc.toFixed(2)}, Annual Expenses: ${annualExpenses.toFixed(2)}, Target Salary Cost: ${targetSalaryCost.toFixed(2)}`);


            if (targetSalaryCost <= 0) {
                 throw new Error(`Frais mensuels (${inputs.ufm} CHF) trop élevés par rapport au chiffre d'affaires disponible après marge.`);
            }

            // Recherche itérative du SBA (synchrone)
            const { finalSBA, finalDeductions, iterations, converged } = findSBA(targetSalaryCost, inputs);

            if (converged && finalSBA != null && finalDeductions) {
                // Affichage des résultats
                displayResults(finalSBA, finalDeductions, inputs, annualTurnover, annualExpenses);
                resultsSection.style.display = 'block';
                additionalInfoSection.style.display = 'block';
                 console.log(`Converged in ${iterations} iterations. Final SBA: ${finalSBA.toFixed(2)}, Final Total Cost: ${(finalSBA + finalDeductions.totalEmployerAnnual + annualExpenses).toFixed(2)}`);
            } else {
                 // Non convergence
                 throw new Error(`Le calcul n'a pas convergé après ${iterations} itérations. Essayez un tarif différent ou vérifiez les paramètres.`);
            }
        } catch (error) {
            // Gestion des erreurs
            console.error("Erreur pendant la simulation:", error);
            errorDiv.textContent = `Erreur lors du calcul : ${error.message}`;
            resultsSection.style.display = 'none';
            additionalInfoSection.style.display = 'none';
        }
    }

    // Fonction pour récupérer et valider les inputs (inchangée)
    function getInputs() {
        let isValid = true; const data = {}; const fields = ['uec', 'udn', 'uen', 'utp', 'utj', 'ufm', 'usf', 'umr'];
        const numberFields = ['uen', 'utp', 'utj', 'ufm', 'umr'];
        fields.forEach(id => { const element = document.getElementById(id); if (!element) { console.error(`${id} not found!`); isValid = false; return; } element.style.border = '1px solid #ccc'; let value = element.value;
            if (id === 'udn' && !value) { alert('Date naissance?'); element.style.border = '1px solid red'; isValid = false; }
            if (numberFields.includes(id)) { value = parseFloat(value); if (isNaN(value) || value < (id === 'utp' ? 1 : 0) || (id === 'utp' && value > 100) || ((id === 'umr') && (value < 0 || value > 100)) ) { alert(`Valeur invalide: ${element.previousElementSibling?.textContent || id}. Vérifiez min/max.`); element.style.border = '1px solid red'; isValid = false; } else if (id === 'ufm' && value < 0) { alert(`Frais >= 0`); element.style.border = '1px solid red'; isValid = false; } }
            data[id] = value; });
        if (!isValid) return null;
        try { const birthDate = new Date(data.udn); const today = new Date(); data.age = today.getFullYear() - birthDate.getFullYear(); const m = today.getMonth() - birthDate.getMonth(); if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) { data.age--; } if (isNaN(data.age) || data.age < 0) throw new Error("Invalid age");
            // Vérification de l'âge minimum
            if (data.age < 18) {
                alert("L'âge minimum requis est de 18 ans.");
                document.getElementById('udn').style.border = '1px solid red';
                isValid = false; // Marquer comme invalide si l'âge est incorrect
                return null; // Retourner null pour arrêter le traitement
            }
        } catch (e) { alert('Date naissance invalide.'); document.getElementById('udn').style.border = '1px solid red'; return null; }
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

        if (sba >= CONFIG.M03) { // Si le salaire est au moins au seuil d'entrée LPP (M03)
            if (sba < CONFIG.M02) {
                // NOUVELLE REGLE: Pour les salaires entre M03 (inclus) et M02 (exclu)
                // Le salaire coordonné est la différence entre la déduction de coordination et le seuil d'entrée.
                salaireCoordonne = CONFIG.M02 - CONFIG.M03;
            } else {
                // REGLE EXISTANTE: Pour les salaires supérieurs ou égaux à M02 (et M03)
                // Le salaire coordonné est le salaire LPP de base moins la déduction de coordination.
                salaireCoordonne = Math.max(0, lppBaseSalary - CONFIG.M02);
            }
        }
        // Si sba < CONFIG.M03, salaireCoordonne reste à 0 (initialisé ci-dessus)

        let lppEmprRateTRx = 0;
        if (inputs.age >= 18) {
             const applicableRateEntry = CONFIG.TR.slice().reverse().find(tr => inputs.age >= tr.age_start);
             if(applicableRateEntry && inputs.age >= 25) { lppEmprRateTRx = applicableRateEntry.rate; }
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
                console.log(`IS Rule: UEC 'A' -> Bareme A0 (ignoring ${numChildren} children for code).`);
            } else if (uecLetter === 'H') {
                withholdingTaxBarème = `H${numChildren}`; // H + nb enfants
                console.log(`IS Rule: UEC 'H' -> Bareme H${numChildren}.`);
            } else if (uecLetter === 'B' || uecLetter === 'C') {
                withholdingTaxBarème = `${uecLetter}${numChildren}`; // B ou C + nb enfants
                console.log(`IS Rule: UEC '${uecLetter}' -> Bareme ${uecLetter}${numChildren}.`);
            } else {
                console.error(`État civil inconnu pour IS: ${inputs.uec}`);
                withholdingTaxBarème = 'A0'; // Fallback simple
            }

            console.log(`Determined withholding tax bareme: ${withholdingTaxBarème}`);

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

        // Dynamically update the payout label based on tax situation
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

        // Canton fixed to GE in display
        taxRateInfoSpan.textContent = ''; 
        if (inputs.usf === 'source' && deductions.withholdingTaxRate > 0) { 
            taxRateInfoSpan.textContent = `Impôts: Barème ${deductions.withholdingTaxBarème} (GE), Taux: ${formatPercent(deductions.withholdingTaxRate)}.`; 
        } else if (inputs.usf === 'source') { 
            taxRateInfoSpan.textContent = `Impôts: Barème ${deductions.withholdingTaxBarème} (GE) - Taux 0%/non trouvé.`; 
        }

        // Display the user-defined target margin
        const userMarginPercentage = inputs.umr;
        exchangeRateInfoSpan.textContent = `Marge brute calculée: ${formatPercent(actualMargin, 2)} (Marge Cible: ${userMarginPercentage.toFixed(1)}%)`;

        // payslipTableBody.innerHTML = ''; // Commenté car le tableau n'est plus affiché
        // const deductionOrder = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08', 'T09', 'T11', 'T12', 'F01', 'T10', 'TAX'];
        // deductionOrder.forEach(id => { 
        //     const detail = deductions.details[id]; 
        //     if (!detail) { return; } 
        //     const alwaysShow = ['T11', 'T12', 'TAX', 'T03', 'F01', 'T10']; 
        //     if (detail.emplAmount === 0 && detail.emprAmount === 0 && !alwaysShow.includes(id)) { return; } // Ne pas afficher si montants nuls et pas dans alwaysShow
        //     const row = payslipTableBody.insertRow(); 
        //     row.insertCell().textContent = detail.name; 
        //     row.insertCell().textContent = (id === 'F01') ? 'N/A' : formatCHF(detail.base / 12); 
        //     row.insertCell().textContent = formatPercent(detail.emplRate); 
        //     row.insertCell().textContent = formatCHF(detail.emplAmount / 12); 
        //     row.insertCell().textContent = (id === 'F01') ? 'N/A' : formatPercent(detail.emprRate); 
        //     row.insertCell().textContent = formatCHF(detail.emprAmount / 12); 
        // });
        // const totalRow = payslipTableBody.insertRow(); 
        // totalRow.style.fontWeight = 'bold'; 
        // totalRow.insertCell().textContent = 'Total Déductions'; 
        // totalRow.insertCell().textContent = ''; 
        // totalRow.insertCell().textContent = ''; 
        // totalRow.insertCell().textContent = formatCHF(deductions.totalEmployeeAnnual / 12); 
        // totalRow.insertCell().textContent = ''; 
        // totalRow.insertCell().textContent = formatCHF(deductions.totalEmployerAnnual / 12);
    }

}); // Fin du DOMContentLoaded