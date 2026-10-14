'use client';

import { NativeSelect } from '@/components/atoms/native-select';
import { Separator } from '@/components/atoms/separator';
import { FieldGroup } from '@/components/molecules/field-group';
import { Stepper } from '@/components/molecules/stepper';
import type { FormSectionProps } from '@/lib/search-form';

const CHILD_AGES = Array.from({ length: 16 }, (_, i) => i + 2);

/** Adults, children with ages, infants. Ages are passed to providers for real pricing. */
export function TravellersSection({ form, update, errors }: FormSectionProps) {
  const setChildAge = (i: number, age: number) => update({ childAges: form.childAges.map((a, j) => (j === i ? age : a)) });
  const setInfantAge = (i: number, age: number) => update({ infantAges: form.infantAges.map((a, j) => (j === i ? age : a)) });
  return (
    <FieldGroup title="Who is travelling">
      <div className="grid gap-3">
        <Stepper id="adults" label="Adults" hint="18 or older" value={form.adults} min={1} max={9} onChange={(adults) => update({ adults })} />
        <Separator />
        <Stepper
          id="children"
          label="Children"
          hint="2 to 17"
          value={form.childAges.length}
          max={8}
          onChange={(n) => update({ childAges: n > form.childAges.length ? [...form.childAges, 8] : form.childAges.slice(0, n) })}
        />
        {form.childAges.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {form.childAges.map((age, i) => (
              <label key={i} className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Child {i + 1} age</span>
                <NativeSelect value={age} onChange={(e) => setChildAge(i, Number(e.target.value))}>
                  {CHILD_AGES.map((a) => (
                    <option key={a} value={a}>
                      {a}
                    </option>
                  ))}
                </NativeSelect>
              </label>
            ))}
          </div>
        )}
        <Separator />
        <Stepper
          id="infants"
          label="Babies"
          hint="Under 2, on a lap"
          value={form.infantAges.length}
          max={form.adults}
          onChange={(n) => update({ infantAges: n > form.infantAges.length ? [...form.infantAges, 0] : form.infantAges.slice(0, n) })}
        />
        {form.infantAges.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {form.infantAges.map((age, i) => (
              <label key={i} className="grid gap-1 text-xs">
                <span className="text-muted-foreground">Baby {i + 1} age</span>
                <NativeSelect value={age} onChange={(e) => setInfantAge(i, Number(e.target.value))}>
                  <option value={0}>Under 1</option>
                  <option value={1}>1</option>
                </NativeSelect>
              </label>
            ))}
          </div>
        )}
        {errors.adults && <p className="text-destructive text-sm">{errors.adults}</p>}
      </div>
    </FieldGroup>
  );
}
