"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Separator } from "@/components/ui/separator";

import type { SettingsSection } from "@/lib/settings-registry";

import { SettingsJsonPanel } from "../settings-json";
import { FieldRenderer } from "./controls";
import type { RawEditors as RawEditorText } from "./helpers";
import { AutoplaceTable, RawEditors, StartingPointsTable } from "./tables";

export function SectionCard({
  section,
  serverName,
  secretIsSet,
  rawEditors,
  setRawEditors,
  rawError,
}: {
  section: SettingsSection;
  serverName: string;
  secretIsSet: Record<string, boolean>;
  rawEditors: RawEditorText;
  setRawEditors: (editors: RawEditorText) => void;
  rawError: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{section.title}</CardTitle>
          {section.badge !== undefined && (
            <Badge variant="secondary">{section.badge}</Badge>
          )}
        </div>
        {section.description !== undefined && (
          <CardDescription>{section.description}</CardDescription>
        )}
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {section.groups.map((group, index) => (
          <div key={group.title ?? index} className="flex flex-col gap-4">
            {group.title !== undefined && (
              <>
                <div className="flex items-center gap-3">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <Separator className="flex-1" />
                </div>
              </>
            )}
            <FieldGroup className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((field) => (
                <FieldRenderer
                  key={field.path}
                  definition={field}
                  secretIsSet={secretIsSet[field.path] === true}
                />
              ))}
            </FieldGroup>
          </div>
        ))}

        {section.custom === "autoplace" && (
          <div className="flex flex-col gap-8">
            <AutoplaceTable />
            <StartingPointsTable />
          </div>
        )}

        {section.custom === "raw" && (
          <div className="flex flex-col gap-8">
            <RawEditors
              editors={rawEditors}
              setEditors={setRawEditors}
              error={rawError}
            />
            <Separator />
            <SettingsJsonPanel name={serverName} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
