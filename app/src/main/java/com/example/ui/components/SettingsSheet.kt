package com.example.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.example.data.OgmPublicBase
import com.example.ui.theme.DarkCard
import com.example.ui.theme.DarkCardBorder
import com.example.ui.theme.SageGreen
import com.example.ui.theme.TextLight
import com.example.ui.theme.TextMuted

private const val HELPER =
    "Leave blank to use AppDeploy (default). Override only if you self-host npm start elsewhere."

@Composable
fun SettingsSheet(
    initialUrl: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit
) {
    var draft by remember(initialUrl) { mutableStateOf(initialUrl) }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .background(DarkCard, RoundedCornerShape(20.dp))
                .border(1.dp, DarkCardBorder, RoundedCornerShape(20.dp))
                .padding(20.dp)
        ) {
            Text(
                text = "Settings",
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold,
                color = TextLight
            )
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = "Converter server URL",
                fontSize = 12.sp,
                fontWeight = FontWeight.SemiBold,
                color = SageGreen
            )
            Spacer(modifier = Modifier.height(8.dp))
            OutlinedTextField(
                value = draft,
                onValueChange = { draft = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(OgmPublicBase.DEFAULT_APPDEPLOY_BASE_URL, color = TextMuted) },
                singleLine = true,
                colors = OutlinedTextFieldDefaults.colors(
                    focusedTextColor = TextLight,
                    unfocusedTextColor = TextLight,
                    focusedBorderColor = SageGreen,
                    unfocusedBorderColor = DarkCardBorder,
                    cursorColor = SageGreen
                )
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(text = HELPER, fontSize = 11.sp, color = TextMuted, lineHeight = 15.sp)
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = "Primary host: AppDeploy (${OgmPublicBase.DEFAULT_APPDEPLOY_BASE_URL}). " +
                    "Clear the field and save to use the default. Self-host: http://192.168.x.x:43123 on same Wi‑Fi.",
                fontSize = 11.sp,
                color = TextMuted,
                lineHeight = 15.sp
            )
            Spacer(modifier = Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth()) {
                TextButton(onClick = onDismiss) {
                    Text("Cancel", color = TextMuted)
                }
                Spacer(modifier = Modifier.weight(1f))
                TextButton(onClick = {
                    onSave("")
                    onDismiss()
                }) {
                    Text("Clear", color = TextMuted)
                }
                TextButton(onClick = {
                    onSave(draft.trim())
                    onDismiss()
                }) {
                    Text("Save", color = SageGreen, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
