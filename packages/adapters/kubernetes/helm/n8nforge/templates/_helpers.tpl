{{- define "n8nforge.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "n8nforge.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "n8nforge.labels" -}}
helm.sh/chart: {{ include "n8nforge.chart" . }}
{{ include "n8nforge.selectorLabels" . }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "n8nforge.chart" -}}
{{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end }}

{{- define "n8nforge.selectorLabels" -}}
app.kubernetes.io/name: {{ include "n8nforge.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "n8nforge.dbHost" -}}
{{- if .Values.database.internal }}
{{- printf "%s-postgres" (include "n8nforge.fullname" .) }}
{{- else }}
{{- required "database.host required when internal=false" .Values.database.host }}
{{- end }}
{{- end }}

{{- define "n8nforge.dbPassword" -}}
{{- required "database.password is required" .Values.database.password }}
{{- end }}

{{- define "n8nforge.ownerPasswordHash" -}}
{{- required "owner.passwordHash is required (bcrypt hash from n8nforge bootstrap --phase pre-boot)" .Values.owner.passwordHash }}
{{- end }}
