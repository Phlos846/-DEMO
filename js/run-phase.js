// Freeze first-run status at creation; progression can unlock during settlement.
export const inFirstRunIntro = state => state.isFirstRun === true && state.day <= 3;
