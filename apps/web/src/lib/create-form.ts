/**
 * The resources step has a submit button. Pressing Enter in a text input must
 * not trigger it implicitly: the operator may still be filling the form.
 * Only an explicit click or keyboard activation of the create button should
 * submit the creation.
 */
export function shouldBlockCreateSubmit(
  step: number,
  stepCount: number,
  key: string,
  tagName: string,
): boolean {
  return step === stepCount && key === "Enter" && tagName === "INPUT";
}
